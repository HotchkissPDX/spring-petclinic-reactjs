package org.springframework.samples.petclinic.service.userService;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.MockitoAnnotations;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.samples.petclinic.model.User;
import org.springframework.samples.petclinic.service.UserService;

import static org.hamcrest.CoreMatchers.is;
import static org.hamcrest.CoreMatchers.not;
import static org.hamcrest.MatcherAssert.assertThat;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public abstract class AbstractUserServiceTests {

    @Autowired
    private UserService userService;

    @BeforeEach
    public void init() {
        MockitoAnnotations.openMocks(this);
    }

    @Test
    public void shouldAddUser() throws Exception {
        User user = new User();
        user.setUsername("username");
        user.setPassword("password");
        user.setEnabled(true);
        user.addRole("OWNER_ADMIN");

        userService.saveUser(user);
        assertThat(user.getRoles().parallelStream().allMatch(role -> role.getName().startsWith("ROLE_")), is(true));
        assertThat(user.getRoles().parallelStream().allMatch(role -> role.getUser() != null), is(true));
    }

    @Test
    public void shouldHashPasswordOnSave() throws Exception {
        User user = new User();
        user.setUsername("hashtest");
        user.setPassword("mypassword");
        user.setEnabled(true);
        user.addRole("OWNER_ADMIN");

        userService.saveUser(user);

        assertThat(user.getPassword(), is(not("mypassword")));
        assertThat(user.getPassword().startsWith("$2a$"), is(true));
    }

    @Test
    public void shouldStoreBcryptVerifiablePassword() throws Exception {
        User user = new User();
        user.setUsername("verifytest");
        user.setPassword("secretpass");
        user.setEnabled(true);
        user.addRole("VET_ADMIN");

        userService.saveUser(user);

        BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
        assertThat(encoder.matches("secretpass", user.getPassword()), is(true));
        assertThat(encoder.matches("wrongpass", user.getPassword()), is(false));
    }
}
