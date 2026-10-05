package kr.publicad;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/settings/{keyStore}")
public class ApiKeys {
    public record KeyInput(@NotNull @Pattern(regexp="[A-Za-z0-9._~+/=:-]{8,4096}") String key) {}
    private final Jobs jobs;
    private final ObjectMapper json;
    private final Path root, envFile;
    private final String node;
    public ApiKeys(Jobs jobs,ObjectMapper json,@Value("${app.root}") String root,@Value("${app.node}") String node,@Value("${app.env-file:}") String envPath){
        this.jobs=jobs;this.json=json;this.root=Path.of(root).toAbsolutePath().normalize();this.node=node;
        this.envFile=envPath.isBlank()?this.root.resolve("agent/.env"):Path.of(envPath).toAbsolutePath();
    }
    @GetMapping public ObjectNode status(@PathVariable String keyStore){synchronized(jobs){return run("status",null,keyStore);}}
    @PostMapping public ObjectNode save(@PathVariable String keyStore,@Valid @RequestBody KeyInput input){return change("save",input.key(),keyStore);}
    @PostMapping("/delete") public ObjectNode delete(@PathVariable String keyStore){return change("delete",null,keyStore);}
    private ObjectNode change(String action,String key,String keyStore){
        synchronized(jobs){
            if(jobs.hasActiveJob())throw new ResponseStatusException(HttpStatus.CONFLICT,"검사가 끝나거나 중단된 후 키를 변경하세요.");
            return run(action,key,keyStore);
        }
    }
    private ObjectNode run(String action,String key,String keyStore){
        String variable=switch(keyStore){case "hcx-key" -> "CLOVASTUDIO_API_KEY";case "luna-key" -> "OPENAI_API_KEY";default -> throw new ResponseStatusException(HttpStatus.NOT_FOUND);};
        Process child=null;
        try{
            child=new ProcessBuilder(node,root.resolve("backend/scripts/env-key.cjs").toString(),envFile.toString(),variable)
                .directory(root.toFile()).redirectError(ProcessBuilder.Redirect.DISCARD).start();
            try(var out=child.getOutputStream()){out.write(json.writeValueAsBytes(json.createObjectNode().put("action",action).put("key",key)));}
            if(!child.waitFor(10,TimeUnit.SECONDS)||child.exitValue()!=0)throw new IOException();
            ObjectNode result=(ObjectNode)json.readTree(child.getInputStream());
            result.put("locked",jobs.hasActiveJob());return result;
        }catch(InterruptedException e){Thread.currentThread().interrupt();throw unavailable();}
        catch(Exception e){throw unavailable();}
        finally{if(child!=null&&child.isAlive())child.destroyForcibly();}
    }
    private ResponseStatusException unavailable(){return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"API 키 저장소를 처리하지 못했습니다. 서버 설정을 확인하세요.");}
}
