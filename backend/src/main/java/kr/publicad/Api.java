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
        @NotNull @Pattern(regexp="hcx|mock") String provider,
        @Min(1) @Max(200) int maxPages,@Min(0) @Max(10000) int maxNodes,
        @Min(1) @Max(600) int maxCalls,@Min(1) @Max(1500) int timeoutSeconds) {}
    private final Jobs jobs;
    public Api(Jobs jobs) {this.jobs=jobs;}
    @GetMapping("/health") public Map<String,Object> health() {return Map.of("app","public-ad-baseline","status","ok","version","0.1.0");}
    @GetMapping("/jobs") public List<ObjectNode> list() {return jobs.list();}
    @GetMapping("/jobs/{id}") public ObjectNode get(@PathVariable String id) throws IOException {return jobs.get(id);}
    @PostMapping("/jobs") public ResponseEntity<ObjectNode> start(@Valid @RequestBody ScanRequest request) throws IOException {
        return ResponseEntity.status(202).body(jobs.start(request));
    }
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
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<?> status(ResponseStatusException e) {
        return ResponseEntity.status(e.getStatusCode()).body(Map.of("error",Objects.requireNonNullElse(e.getReason(),"요청 처리 실패")));
    }
    @ExceptionHandler({MethodArgumentNotValidException.class,HttpMessageNotReadableException.class}) public ResponseEntity<?> invalid(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("error","입력값과 실행 한도를 확인하세요."));
    }
    @ExceptionHandler(IOException.class) public ResponseEntity<?> storage(IOException e) {
        return ResponseEntity.internalServerError().body(Map.of("error","작업 저장소를 읽거나 쓸 수 없습니다."));
    }
}
