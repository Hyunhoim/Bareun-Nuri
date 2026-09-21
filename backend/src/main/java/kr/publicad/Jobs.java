package kr.publicad;

import com.fasterxml.jackson.databind.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.annotation.PreDestroy;
import java.io.*;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Jobs {
    private final ObjectMapper json;
    private final Path root, storage;
    private final String node;
    // ponytail: one active local scan; add a durable worker queue only for multi-user deployment.
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final ScheduledExecutorService watchdog = Executors.newSingleThreadScheduledExecutor();
    private final Map<String,ObjectNode> jobs = new LinkedHashMap<>();
    private String activeId;
    private Process process;
    private BufferedWriter input;

    public Jobs(ObjectMapper json, @Value("${app.root}") String root, @Value("${app.node}") String node) throws IOException {
        this.json=json; this.root=Path.of(root).toAbsolutePath().normalize(); this.node=node;
        storage=this.root.resolve(".runtime/jobs"); Files.createDirectories(storage);
        try(var folders=Files.list(storage)) {
            for(Path folder:folders.toList()) {
                if(!folder.getFileName().toString().matches("[0-9a-f-]{36}")) continue;
                Path file=folder.resolve("job.json"); if(!Files.exists(file)) continue;
                ObjectNode job=(ObjectNode)json.readTree(file.toFile());
                String id=folder.getFileName().toString();
                if(!id.equals(job.path("id").asText())) throw new IOException("Job identity mismatch");
                if(!terminal(job.path("status").asText())) {
                    job.put("status","interrupted");job.put("phase","finished");job.put("error","백엔드 재시작으로 중단되었습니다. 새 검사를 시작하세요.");
                    persist(id,job);
                }
                jobs.put(id,job);
            }
        }
    }
    private boolean terminal(String status) { return Set.of("completed","completed_with_warnings","failed","cancelled","interrupted").contains(status); }
    private Path folder(String id) { return storage.resolve(id); }
    private void persist(String id,ObjectNode job) throws IOException {
        Path temp=folder(id).resolve("job.json.tmp"), file=folder(id).resolve("job.json");
        json.writerWithDefaultPrettyPrinter().writeValue(temp.toFile(),job);
        try {Files.move(temp,file,StandardCopyOption.ATOMIC_MOVE,StandardCopyOption.REPLACE_EXISTING);}
        catch(AtomicMoveNotSupportedException e) {Files.move(temp,file,StandardCopyOption.REPLACE_EXISTING);}
    }
    private synchronized void update(String id,ObjectNode changes) throws IOException {
        ObjectNode job=jobs.get(id); job.setAll(changes);job.put("updatedAt",Instant.now().toString());persist(id,job);
    }
    public synchronized List<ObjectNode> list() {
        return jobs.values().stream().map(ObjectNode::deepCopy).sorted(Comparator.comparing((ObjectNode j)->j.path("startedAt").asText()).reversed()).toList();
    }
    public synchronized ObjectNode get(String id) throws IOException {
        ObjectNode job=jobs.get(id);if(job==null) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"작업을 찾을 수 없습니다.");
        ObjectNode copy=job.deepCopy();
        if(job.path("status").asText().startsWith("completed")) {
            copy.set("result",json.readTree(folder(id).resolve("artifacts/result.json").toFile()));
            copy.set("diagnostics",json.readTree(folder(id).resolve("artifacts/diagnostics.json").toFile()));
        }
        return copy;
    }
    public synchronized ObjectNode start(Api.ScanRequest request) throws IOException {
        if(activeId!=null) throw new ResponseStatusException(HttpStatus.CONFLICT,"이미 진행 중인 검사가 있습니다.");
        URI uri;
        try {uri=URI.create(request.url());}
        catch(Exception e) {throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"올바른 URL을 입력하세요.");}
        if(!Set.of("http","https").contains(Optional.ofNullable(uri.getScheme()).orElse("")) || uri.getHost()==null || uri.getRawUserInfo()!=null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"인증정보 없는 HTTP(S) URL만 허용됩니다.");
        if(!Files.isRegularFile(root.resolve("agent/src/worker.cjs"))) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Agent 파일을 찾을 수 없습니다.");
        String id=UUID.randomUUID().toString();Files.createDirectories(folder(id).resolve("artifacts"));
        ObjectNode job=json.valueToTree(request);job.put("id",id).put("status","queued").put("phase","queued")
            .put("startedAt",Instant.now().toString()).put("updatedAt",Instant.now().toString())
            .put("pages",0).put("candidates",0).put("processed",0).put("calls",0);
        persist(id,job);jobs.put(id,job);activeId=id;
        executor.execute(()->execute(id,request));return job.deepCopy();
    }
    private void execute(String id,Api.ScanRequest request) {
        ScheduledFuture<?> timeout=null;
        boolean done=false;
        try {
            Process child=new ProcessBuilder(node,root.resolve("agent/src/worker.cjs").toString())
                .directory(root.toFile()).redirectError(folder(id).resolve("agent-stderr.log").toFile()).start();
            synchronized(this) {
                process=child; input=new BufferedWriter(new OutputStreamWriter(child.getOutputStream(),StandardCharsets.UTF_8));
                ObjectNode config=json.valueToTree(request);
                Path env=root.resolve("agent/.env");if(!Files.exists(env)) env=root.resolve("agent-experiments/.env");
                config.put("jobDir",folder(id).resolve("artifacts").toString()).put("envFile",env.toString());
                input.write(json.writeValueAsString(config));input.newLine();input.flush();
                if(jobs.get(id).path("cancelRequested").asBoolean()) sendCancel();
            }
            timeout=watchdog.schedule(()->kill(child),request.timeoutSeconds()+15L,TimeUnit.SECONDS);
            try(BufferedReader output=new BufferedReader(new InputStreamReader(child.getInputStream(),StandardCharsets.UTF_8))) {
                String line;
                while((line=output.readLine())!=null) {
                    ObjectNode event=(ObjectNode)json.readTree(line);String type=event.path("type").asText();event.remove("type");
                    if(type.equals("progress")) update(id,event);
                    else if(type.equals("done")) {
                        if(!terminal(event.path("status").asText())) throw new IOException("Invalid terminal event");
                        update(id,event);done=true;
                    } else if(type.equals("fatal")) throw new IOException("Agent reported a fatal error");
                }
            }
            int exit=child.waitFor();
            synchronized(this) {
                String status=jobs.get(id).path("status").asText();
                if(!done || (status.startsWith("completed") && (exit!=0 || !Files.isRegularFile(folder(id).resolve("artifacts/result.json")))))
                    update(id,json.createObjectNode().put("status",jobs.get(id).path("cancelRequested").asBoolean()?"cancelled":"failed")
                        .put("phase","finished").put("error","Agent가 완료 결과 없이 종료되었습니다. 실행 로그를 확인하세요."));
            }
        } catch(Exception e) {
            try {update(id,json.createObjectNode().put("status","failed").put("phase","finished").put("error","Agent 실행 또는 결과 저장 실패: "+e.getClass().getSimpleName()));}
            catch(IOException ignored) {System.err.println("Cannot persist failed job "+id);}
        } finally {
            if(timeout!=null) timeout.cancel(false);
            synchronized(this) {if(process!=null && process.isAlive()) kill(process);process=null;input=null;activeId=null;}
        }
    }
    private void sendCancel() throws IOException {input.write("{\"action\":\"cancel\"}\n");input.flush();}
    public synchronized ObjectNode cancel(String id) throws IOException {
        ObjectNode job=jobs.get(id);if(job==null) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"작업을 찾을 수 없습니다.");
        if(terminal(job.path("status").asText())) return job.deepCopy();
        update(id,json.createObjectNode().put("cancelRequested",true));
        if(id.equals(activeId) && input!=null) {
            sendCancel();Process child=process;watchdog.schedule(()->kill(child),10,TimeUnit.SECONDS);
        }
        return job.deepCopy();
    }
    private static void kill(Process child) {
        if(child==null || !child.isAlive()) return;
        child.descendants().forEach(p->{p.destroy();if(p.isAlive()) p.destroyForcibly();});
        child.destroy();if(child.isAlive()) child.destroyForcibly();
    }
    @PreDestroy public synchronized void shutdown() {kill(process);executor.shutdownNow();watchdog.shutdownNow();}
}
