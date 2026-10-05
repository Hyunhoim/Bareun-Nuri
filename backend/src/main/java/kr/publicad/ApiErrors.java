package kr.publicad;
import java.io.IOException;
import java.util.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.server.ResponseStatusException;
@RestControllerAdvice
public class ApiErrors {
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
