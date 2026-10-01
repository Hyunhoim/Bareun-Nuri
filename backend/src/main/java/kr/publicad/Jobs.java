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
                    job.put("status","interrupted");job.put("phase","finished");job.put("error","백엔드 재시작으로 중단되었습니다. 저장 상태 확인 후 재개할 수 있습니다.");
                    persist(id,job);
                }
                jobs.put(id,job);
            }
        }
    }
    private boolean terminal(String status) { return Set.of("completed","completed_with_warnings","failed","cancelled","interrupted","partial").contains(status); }
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
        copy.put("canResume",canResume(id,job));
        // Live artifact readers can block the worker atomic replacement on Windows.
        if(!id.equals(activeId) && Files.isRegularFile(folder(id).resolve("artifacts/result.json"))) {
            copy.set("result",json.readTree(folder(id).resolve("artifacts/result.json").toFile()));
            copy.set("diagnostics",json.readTree(folder(id).resolve("artifacts/diagnostics.json").toFile()));
            Path coverage=folder(id).resolve("artifacts/coverage.json");
            if(Files.isRegularFile(coverage)) copy.set("coverage",json.readTree(coverage.toFile()));
        }
        return copy;
    }
    private boolean canResume(String id,ObjectNode job) throws IOException {
        if(activeId!=null || job.path("closed").asBoolean() || !terminal(job.path("status").asText())) return false;
        Path file=folder(id).resolve("artifacts/checkpoint.json"); if(!Files.isRegularFile(file)) return false;
        JsonNode state=json.readTree(file.toFile()).path("state"),flight=state.path("inflight");
        if(!flight.isMissingNode()&&!flight.isNull()) {
            if("wave".equals(flight.path("phase").asText())) {
                JsonNode requests=flight.path("requests");
                if(!requests.isArray() || requests.isEmpty()) return false;
                for(JsonNode request:requests)
                    if(!Set.of("prepared","rejected","durable").contains(request.path("phase").asText())) return false;
            } else if(!Set.of("prepared","rejected").contains(flight.path("phase").asText())) return false;
        }
        JsonNode recovery=state.path("recovery"), recoveryFlight=recovery.path("inflight");
        if(!recoveryFlight.isMissingNode()&&!recoveryFlight.isNull()
            && !Set.of("prepared","rejected","durable").contains(recoveryFlight.path("phase").asText())) return false;
        if(state.path("pending").size()>0) return true;
        for(JsonNode page:state.path("pages"))
            if(page.path("offset").isIntegralNumber() && page.path("work").isIntegralNumber()
                && page.path("offset").asLong()>=0 && page.path("offset").asLong()<page.path("work").asLong()) return true;
        if(recovery.path("queue").isArray()) {
            int cursor=recovery.path("cursor").asInt(-1);
            return cursor>=0 && cursor<60 && cursor<recovery.path("queue").size();
        }
        for(JsonNode page:state.path("pages")) if(page.path("quarantined_work").asInt()>0) return true;
        return state.path("work").size()>state.path("decisions").size();
    }
    public synchronized ObjectNode resume(String id) throws IOException {
        ObjectNode job=jobs.get(id);if(job==null) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"작업을 찾을 수 없습니다.");
        if(!canResume(id,job))throw new ResponseStatusException(HttpStatus.CONFLICT,"재개할 수 없습니다. 진행 중 작업 또는 미확인 요청·저장 상태를 확인하세요.");
        // Same job identity/settings, a fresh execution segment; never reset the original start time.
        Api.ScanRequest request=new Api.ScanRequest(job.path("url").asText(),job.path("provider").asText(),job.path("maxPages").asInt(),0,
            job.path("maxCalls").asInt(),Math.min(1500,job.path("timeoutSeconds").asInt()));
        job.remove(List.of("error","reason","cancelRequested"));job.put("maxNodes",0);
        update(id,json.createObjectNode().put("status","queued").put("phase","queued").put("segmentStartedAt",Instant.now().toString()));
        activeId=id;executor.execute(()->execute(id,request));return job.deepCopy();
    }
    public synchronized ObjectNode finish(String id) throws IOException {
        ObjectNode job=jobs.get(id);if(job==null)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"작업을 찾을 수 없습니다.");
        if(!terminal(job.path("status").asText()) || id.equals(activeId))throw new ResponseStatusException(HttpStatus.CONFLICT,"먼저 검사 중단과 저장을 기다려 주세요.");
        update(id,json.createObjectNode().put("closed",true));return get(id);
    }
    public synchronized JsonNode segmentResult(String id,int segment) throws IOException {
        if(!jobs.containsKey(id)||segment<1)throw new ResponseStatusException(HttpStatus.NOT_FOUND,"결과를 찾을 수 없습니다.");
        Path file=folder(id).resolve("artifacts/segments/"+String.format("%04d",segment)+"/result.json");
        if(!Files.isRegularFile(file))throw new ResponseStatusException(HttpStatus.NOT_FOUND,"저장된 구간 결과가 없습니다.");
        return json.readTree(file.toFile());
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
        job.put("segmentStartedAt",job.path("startedAt").asText());persist(id,job);jobs.put(id,job);activeId=id;
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
                Path env=root.resolve("agent/.env");
                config.put("jobDir",folder(id).resolve("artifacts").toString()).put("envFile",env.toString());
                config.put("segmentStartedAt",jobs.get(id).path("segmentStartedAt").asText()).put("firstStartedAt",jobs.get(id).path("startedAt").asText());
                input.write(json.writeValueAsString(config));input.newLine();input.flush();
                if(jobs.get(id).path("cancelRequested").asBoolean()) sendCancel();
            }
            long remaining=Math.max(0,request.timeoutSeconds()*1000L+300000L-(System.currentTimeMillis()-Instant.parse(jobs.get(id).path("segmentStartedAt").asText()).toEpochMilli()));
            timeout=watchdog.schedule(()->kill(child),remaining,TimeUnit.MILLISECONDS);
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
            e.printStackTrace(System.err);
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
