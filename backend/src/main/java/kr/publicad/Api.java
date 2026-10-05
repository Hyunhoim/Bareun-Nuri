package kr.publicad;

import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.io.IOException;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api")
public class Api {
    public record ScanRequest(@NotBlank @Size(max=2048) String url,
        @NotNull @Pattern(regexp="hcx|luna|mock") String provider,
        @Min(1) @Max(200) int maxPages,@Min(0) @Max(10000) int maxNodes,
        @Min(1) @Max(600) int maxCalls,@Min(1) @Max(1500) int timeoutSeconds) {
        public boolean isSubmission() {return ("hcx".equals(provider)||"luna".equals(provider))&&maxPages==200&&maxNodes==0&&maxCalls==600&&timeoutSeconds==1500;}
    }
    private final Jobs jobs;
    public Api(Jobs jobs) {this.jobs=jobs;}
    @GetMapping("/health") public Map<String,Object> health() {return Map.of("app","public-ad-baseline","status","ok","version","0.1.0");}
    @GetMapping("/jobs") public List<ObjectNode> list() {return jobs.list();}
    @GetMapping("/jobs/{id}") public ObjectNode get(@PathVariable String id) throws IOException {return jobs.get(id);}
    @PostMapping("/jobs/{id}/delete") public Map<String,Boolean> delete(@PathVariable String id) throws IOException {jobs.delete(id);return Map.of("deleted",true);}
    @PostMapping("/jobs") public ResponseEntity<ObjectNode> start(@Valid @RequestBody ScanRequest request) throws IOException {
        return ResponseEntity.status(202).body(jobs.start(request));
    }
    @PostMapping("/jobs/{id}/pause") public ObjectNode pause(@PathVariable String id) throws IOException {return jobs.pause(id);}
    @PostMapping("/jobs/{id}/cancel") public ObjectNode cancel(@PathVariable String id) throws IOException {return jobs.cancel(id);}
    @PostMapping("/jobs/{id}/resume") public ObjectNode resume(@PathVariable String id) throws IOException {return jobs.resume(id);}
    @PostMapping("/jobs/{id}/finish") public ObjectNode finish(@PathVariable String id) throws IOException {return jobs.finish(id);}
    @GetMapping("/jobs/{id}/segments/{segment}/result") public ResponseEntity<Object> segment(@PathVariable String id,@PathVariable int segment) throws IOException {
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"result-segment-"+segment+".json\"").body(jobs.segmentResult(id,segment));
    }
    @GetMapping("/jobs/{id}/result") public ResponseEntity<Object> result(@PathVariable String id) throws IOException {
        ObjectNode job=jobs.get(id);
        if(!job.has("result")) throw new ResponseStatusException(HttpStatus.CONFLICT,"완료된 결과가 없습니다.");
        return ResponseEntity.ok().header(HttpHeaders.CONTENT_DISPOSITION,"attachment; filename=\"result.json\"").body(job.get("result"));
    }
}
