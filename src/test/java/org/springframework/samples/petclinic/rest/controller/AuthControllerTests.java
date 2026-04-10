package org.springframework.samples.petclinic.rest.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class AuthControllerTests {

    @Autowired
    private MockMvc mockMvc;

    private final ObjectMapper mapper = new ObjectMapper();

    private String loginJson(String username, String password) throws Exception {
        return mapper.writeValueAsString(Map.of("username", username, "password", password));
    }

    @Test
    void loginWithValidCredentialsShouldReturnUserInfo() throws Exception {
        this.mockMvc.perform(post("/api/auth/login")
                .content(loginJson("admin", "admin"))
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"))
            .andExpect(jsonPath("$.roles").isArray())
            .andExpect(jsonPath("$.roles").isNotEmpty());
    }

    @Test
    void loginWithInvalidPasswordShouldReturn401() throws Exception {
        this.mockMvc.perform(post("/api/auth/login")
                .content(loginJson("admin", "wrongpassword"))
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void loginWithNonexistentUserShouldReturn401() throws Exception {
        this.mockMvc.perform(post("/api/auth/login")
                .content(loginJson("nobody", "admin"))
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void meWithValidSessionShouldReturnUserInfo() throws Exception {
        MvcResult loginResult = this.mockMvc.perform(post("/api/auth/login")
                .content(loginJson("admin", "admin"))
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andReturn();

        MockHttpSession session = (MockHttpSession) loginResult.getRequest().getSession(false);

        this.mockMvc.perform(get("/api/auth/me")
                .session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"))
            .andExpect(jsonPath("$.roles").isArray());
    }

    @Test
    void meWithoutSessionShouldReturn401() throws Exception {
        this.mockMvc.perform(get("/api/auth/me"))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutShouldInvalidateSession() throws Exception {
        MvcResult loginResult = this.mockMvc.perform(post("/api/auth/login")
                .content(loginJson("admin", "admin"))
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andReturn();

        MockHttpSession session = (MockHttpSession) loginResult.getRequest().getSession(false);

        this.mockMvc.perform(post("/api/auth/logout")
                .session(session))
            .andExpect(status().isNoContent());

        this.mockMvc.perform(get("/api/auth/me")
                .session(session))
            .andExpect(status().isUnauthorized());
    }

    @Test
    void sessionPersistsAcrossRequests() throws Exception {
        MvcResult loginResult = this.mockMvc.perform(post("/api/auth/login")
                .content(loginJson("admin", "admin"))
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk())
            .andReturn();

        MockHttpSession session = (MockHttpSession) loginResult.getRequest().getSession(false);

        this.mockMvc.perform(get("/api/auth/me").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"));

        this.mockMvc.perform(get("/api/auth/me").session(session))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.username").value("admin"));
    }

    @Test
    void loginEndpointShouldBeAccessibleWithoutAuth() throws Exception {
        this.mockMvc.perform(post("/api/auth/login")
                .content(loginJson("admin", "admin"))
                .contentType(MediaType.APPLICATION_JSON))
            .andExpect(status().isOk());
    }
}
