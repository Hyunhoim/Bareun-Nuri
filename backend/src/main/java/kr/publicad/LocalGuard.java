package kr.publicad;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.Set;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/** This baseline is a loopback desktop app, not a public authenticated service. */
@Component
public class LocalGuard extends OncePerRequestFilter {
    @Override protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String host = request.getHeader("Host"), origin = request.getHeader("Origin");
        int port = request.getLocalPort();
        boolean validHost = Set.of("127.0.0.1:"+port, "localhost:"+port).contains(host == null ? "" : host);
        boolean validOrigin = origin == null || origin.equals("http://127.0.0.1:"+port) || origin.equals("http://localhost:"+port);
        boolean mutation = !Set.of("GET", "HEAD").contains(request.getMethod());
        if (!validHost || !validOrigin || (mutation && !"public-ad-ui".equals(request.getHeader("X-Local-Client")))) {
            response.setStatus(403); response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"Local same-origin requests only\"}"); return;
        }
        response.setHeader("X-Content-Type-Options", "nosniff");
        response.setHeader("Referrer-Policy", "no-referrer");
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
        if (request.getRequestURI().startsWith("/api/")) response.setHeader("Cache-Control", "no-store");
        chain.doFilter(request, response);
    }
}
