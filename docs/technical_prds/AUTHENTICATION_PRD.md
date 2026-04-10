# Authentication & Session Management - Technical PRD

## Overview

This document defines the implementation of secure authentication and session management for the Spring PetClinic ReactJS application. All four phases are complete: bcrypt password hashing, session-based authentication via server-side cookies, frontend login/logout UI with route guards, and admin-only user creation.

Baseline reference: [docs/baseline/AUTH_PRD.md](../baseline/AUTH_PRD.md) (pre-implementation backend state)

---

## Business Requirements

### Authentication
- Users must authenticate with a username and password to access the application
- Authenticated sessions persist via a browser cookie managed by the server
- Users can log out, which invalidates their session and redirects to the login page
- Only the login endpoint is accessible without authentication (when security is enabled)

### Password Security
- Passwords must be hashed using bcrypt before storage
- Plaintext password storage (`{noop}` prefix) must be eliminated
- Existing seed data must be migrated to bcrypt-hashed values

### User Management
- User creation remains admin-only (`ROLE_ADMIN` required)
- Administrators can create users with a username, password, and one or more roles via a frontend form
- The security toggle (`petclinic.security.enable`) is preserved as a developer convenience; when `false`, all endpoints remain open without authentication

### Role-Based Access Control
- Existing RBAC roles (`OWNER_ADMIN`, `VET_ADMIN`, `ADMIN`) and their `@PreAuthorize` enforcement are unchanged
- The frontend displays navigation items conditionally based on the authenticated user's roles

---

## Technical Requirements

### Database Schema

**Current schema** (unchanged structurally, column width increase only):

```sql
CREATE TABLE users (
  username    VARCHAR(20)  NOT NULL,
  password    VARCHAR(256) NOT NULL,   -- widened from VARCHAR(20) to accommodate bcrypt hashes
  enabled     BOOLEAN DEFAULT TRUE NOT NULL,
  PRIMARY KEY (username)
);

CREATE TABLE roles (
  id        INTEGER IDENTITY PRIMARY KEY,
  username  VARCHAR(20) NOT NULL,
  role      VARCHAR(20) NOT NULL
);
ALTER TABLE roles ADD CONSTRAINT fk_username FOREIGN KEY (username) REFERENCES users (username);
CREATE INDEX fk_username_idx ON roles (username);
```

**Schema change:** The `password` column must be widened from `VARCHAR(20)` to `VARCHAR(256)` in all three DB engine init scripts. Bcrypt hashes are 60 characters; `VARCHAR(256)` provides headroom for future encoding changes.

**Updated seed data:**

```sql
-- Replace {noop}admin with bcrypt-hashed 'admin'
INSERT INTO users(username, password, enabled)
  VALUES ('admin', '$2a$10$<bcrypt-hash-of-admin>', true);

INSERT INTO roles (username, role) VALUES ('admin', 'ROLE_OWNER_ADMIN');
INSERT INTO roles (username, role) VALUES ('admin', 'ROLE_VET_ADMIN');
INSERT INTO roles (username, role) VALUES ('admin', 'ROLE_ADMIN');
```

### API Endpoints

#### POST /api/auth/login
**Description:** Authenticate a user and create a server-side session.

**Authorization:** None (public endpoint)

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin"
}
```

**Behavior:**
- Validates credentials against the `users`/`roles` tables via Spring Security's `AuthenticationManager`
- On success, creates an `HttpSession` and returns the authenticated user's info and roles
- On failure, returns 401 with an error message

**Response:**
- Success (200):
```json
{
  "username": "admin",
  "roles": ["ROLE_OWNER_ADMIN", "ROLE_VET_ADMIN", "ROLE_ADMIN"]
}
```
- Error (401): `{ "message": "Invalid username or password" }`

#### POST /api/auth/logout
**Description:** Invalidate the current session.

**Authorization:** Authenticated users only

**Behavior:**
- Invalidates the `HttpSession`
- Clears the session cookie

**Response:**
- Success (204): No content

#### GET /api/auth/me
**Description:** Return the currently authenticated user.

**Authorization:** Authenticated users only

**Behavior:**
- Reads the `SecurityContextHolder` to obtain the current principal
- Returns username and roles

**Response:**
- Success (200):
```json
{
  "username": "admin",
  "roles": ["ROLE_OWNER_ADMIN", "ROLE_VET_ADMIN", "ROLE_ADMIN"]
}
```
- Error (401): Not authenticated

#### POST /api/users (existing, unchanged)
**Description:** Create a new user account.

**Authorization:** `hasRole(ROLE_ADMIN)` — admin-only, no change from current behavior

**Note:** The endpoint does NOT accept a trailing slash (`/api/users/` returns 400). The frontend must use `api/users` without a trailing slash.

### User Interface Requirements

#### Login Page (/login)
- Username text input (required)
- Password text input (required)
- "Sign In" submit button
- Error message display area for invalid credentials
- On successful login, redirect to the page the user originally requested (or `/` by default)
- Styled with Bootstrap 3 (`form-horizontal`, `form-group`, `form-control`, `btn btn-default`)

#### Navbar Updates (all pages)
- When authenticated: display the current username on the right side of the navbar
- When authenticated: display a "Logout" link/button that calls `POST /api/auth/logout` and redirects to `/login`
- When the user has `ROLE_ADMIN`: display a "Manage Users" nav item linking to `/admin/users/new`

#### Admin User Creation Page (/admin/users/new)
- Username text input (required)
- Password text input (required)
- Role checkboxes: `OWNER_ADMIN`, `VET_ADMIN`, `ADMIN` (at least one required)
- "Create User" submit button
- Success/error feedback display
- Only accessible to users with `ROLE_ADMIN`; other users are redirected away

---

## Implementation Phases

### Phase 1: Password Security Hardening - COMPLETED

**Objective**: Replace plaintext password storage with bcrypt hashing

**Tasks**:
1. Widen `password` column from `VARCHAR(20)` to `VARCHAR(256)` in `db/hsqldb/initDB.sql`, `db/mysql/initDB.sql`, `db/postgresql/initDB.sql`
2. Register a `PasswordEncoder` bean (bcrypt) in `WebSecurityConfig` (always available regardless of security toggle)
3. Inject `PasswordEncoder` into `UserServiceImpl` and hash passwords in `saveUser()` before persisting
4. Regenerate seed data in all three `populateDB.sql` files with bcrypt-hashed password for the `admin` user
5. Update `User` entity's `password` column annotation to reflect new length: `@Column(name = "password", length = 256)`

**Deliverables**:
- Modified: `initDB.sql` (x3), `populateDB.sql` (x3), `WebSecurityConfig.java`, `UserServiceImpl.java`, `User.java`

### Phase 2: Session-Based Authentication (Backend) - COMPLETED

**Objective**: Replace HTTP Basic with session-based authentication; add login/logout/me endpoints

**Tasks**:
1. Create `AuthController` with `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` endpoints
2. Update `BasicAuthenticationConfig`:
   - Remove `.httpBasic()`
   - Add `.sessionManagement()` with `SessionCreationPolicy.IF_REQUIRED`
   - Permit `/api/auth/login` without authentication
   - Require authentication for all other `/api/**` paths
   - Add custom `AuthenticationEntryPoint` returning 401 (not default 403) for unauthenticated requests
   - Wire `PasswordEncoder` into JDBC authentication
   - Wire shared `CorsConfigurationSource` bean for CORS
3. Expose an `AuthenticationManager` bean so `AuthController` can programmatically authenticate
4. Refactor `WebSecurityConfig`:
   - Remove its `SecurityFilterChain` bean (conflicted with `BasicAuthenticationConfig`'s chain)
   - Expose `CorsConfigurationSource` as a shared bean (consumed by both `BasicAuthenticationConfig` and `DisableSecurityConfig`)
   - CORS settings: `allowCredentials(true)`, `DELETE` in allowed methods, explicit `allowedHeaders("*")`
5. Update `DisableSecurityConfig`:
   - Wire shared `CorsConfigurationSource` bean so CORS works when security is disabled

**Deliverables**:
- Modified: `BasicAuthenticationConfig.java`, `WebSecurityConfig.java`, `DisableSecurityConfig.java`
- New: `AuthController.java`

### Phase 3: Frontend Login/Logout UI - COMPLETED

**Objective**: Add login page, session-aware fetch wrapper, route guards, and navbar auth state

**Tasks**:
1. Create auth state module `client/src/auth/index.ts`:
   - Module-level `currentUser` variable
   - `login(username, password)` — calls `POST /api/auth/login` with `credentials: 'include'`, stores result
   - `logout()` — calls `POST /api/auth/logout`, clears `currentUser`
   - `getCurrentUser()` — returns `currentUser`
   - `checkSession()` — calls `GET /api/auth/me` to restore session on page load
   - `isAuthenticated()` — returns `true` if `currentUser` is set
   - `hasRole(role)` — checks if current user has a specific role
2. Create `LoginPage` component at `client/src/components/auth/LoginPage.tsx`:
   - Class component with local state for `username`, `password`, `error`
   - Form submits via auth module's `login()` function
   - On success, redirect to `/` (or previous location via `location.state.nextPathname`)
   - On failure, display error message
3. Update `client/src/util/index.tsx`:
   - Add `credentials: 'include'` to `submitForm()`
   - Fix `url()` to strip leading slashes from paths (prevents double-slash URLs that bypass CORS)
   - Fix `submitForm()` response handling: read body as text before JSON parsing to handle empty bodies gracefully
4. Add `credentials: 'include'` to **all** bare `fetch()` calls across components:
   - `VetsPage.tsx`, `FindOwnersPage.tsx`, `OwnersPage.tsx`, `EditOwnerPage.tsx`, `VisitsPage.tsx`, `EditPetPage.tsx`, `createPetEditorModel.ts`
5. Update `client/src/configureRoutes.tsx`:
   - Add `/login` route for `LoginPage` (outside the guarded route tree)
   - Add `onEnter` guard (`requireAuth`) on each protected route that calls `checkSession()` and redirects unauthenticated users to `/login`
   - Add `.catch()` handler on the guard to prevent route transitions from hanging when the backend is unreachable
6. Update `client/src/components/Menu.tsx`:
   - Import auth state module
   - Display `currentUser.username` in the navbar (right-aligned)
   - Add "Logout" link that calls `logout()` and redirects to `/login`

**Deliverables**:
- New: `client/src/components/auth/LoginPage.tsx`, `client/src/auth/index.ts`
- Modified: `client/src/util/index.tsx`, `client/src/configureRoutes.tsx`, `client/src/components/Menu.tsx`, plus `credentials: 'include'` added to 7 component files

### Phase 4: Admin User Management UI - COMPLETED

**Objective**: Add a frontend form for admin-only user creation, wiring to the existing `POST /api/users` endpoint

**Tasks**:
1. Create `UserCreatePage` component at `client/src/components/admin/UserCreatePage.tsx`:
   - Class component with local state for `username`, `password`, `roles[]`, `success`, `error`
   - Role options rendered as checkboxes: Owner Admin (`ROLE_OWNER_ADMIN`), Vet Admin (`ROLE_VET_ADMIN`), Admin (`ROLE_ADMIN`)
   - Submits via `submitForm('POST', 'api/users', payload, callback)` with payload `{ username, password, enabled: true, roles: [{ name: "ROLE_..." }] }` matching the OpenAPI `User` schema
   - Displays green success alert with username on 201, red error alert on 400+
   - Resets form fields after successful creation
2. Update `client/src/configureRoutes.tsx`:
   - Add `/admin/users/new` route for `UserCreatePage`
   - Add `requireAdmin` `onEnter` guard: checks session then verifies `ROLE_ADMIN`; redirects unauthenticated users to `/login`, non-admins to `/`
   - Includes `.catch()` handler matching the `requireAuth` pattern
3. Update `client/src/components/Menu.tsx`:
   - Add "Manage Users" nav item with user icon, linking to `/admin/users/new`
   - Only rendered when `hasRole('ROLE_ADMIN')` returns `true`
   - Positioned before the logout link in the navbar

**Deliverables**:
- New: `client/src/components/admin/UserCreatePage.tsx`
- Modified: `client/src/configureRoutes.tsx`, `client/src/components/Menu.tsx`

---

## Technical Implementation Details

### Key Files

**Backend (modified):**
- `src/main/java/org/springframework/samples/petclinic/security/BasicAuthenticationConfig.java` — Session-based auth, `AuthenticationManager` bean, CORS wiring, custom 401 `AuthenticationEntryPoint`
- `src/main/java/org/springframework/samples/petclinic/security/WebSecurityConfig.java` — Shared `PasswordEncoder` and `CorsConfigurationSource` beans (no longer defines its own `SecurityFilterChain`)
- `src/main/java/org/springframework/samples/petclinic/security/DisableSecurityConfig.java` — Wires shared `CorsConfigurationSource` for CORS when security is disabled
- `src/main/java/org/springframework/samples/petclinic/service/UserServiceImpl.java` — Password hashing via injected `PasswordEncoder`
- `src/main/java/org/springframework/samples/petclinic/model/User.java` — Password column length annotation update
- `src/main/resources/application.properties` — `petclinic.security.enable` default changed from `false` to `true`

**Backend (new):**
- `src/main/java/org/springframework/samples/petclinic/rest/controller/AuthController.java` — Login, logout, me endpoints

**Frontend (modified):**
- `client/src/configureRoutes.tsx` — Login route, `requireAuth` guards with error handling, `requireAdmin` guard for admin routes
- `client/src/components/Menu.tsx` — User display, logout, and admin-only "Manage Users" nav item
- `client/src/util/index.tsx` — `credentials: 'include'`, leading-slash normalization in `url()`, safe JSON parsing in `submitForm()`
- `client/src/components/owners/*.tsx`, `client/src/components/vets/VetsPage.tsx`, `client/src/components/visits/VisitsPage.tsx`, `client/src/components/pets/*.tsx` — `credentials: 'include'` added to all bare `fetch()` calls

**Frontend (new):**
- `client/src/auth/index.ts` — Auth state management module
- `client/src/components/auth/LoginPage.tsx` — Login form
- `client/src/components/admin/UserCreatePage.tsx` — Admin user creation form with role checkboxes

**Tests (backend):**
- `src/test/java/org/springframework/samples/petclinic/rest/controller/AuthControllerTests.java` — Session auth endpoint tests
- `src/test/java/org/springframework/samples/petclinic/service/userService/AbstractUserServiceTests.java` — Password hashing tests

**Tests (frontend):**
- `client/tests/auth/__tests__/auth.test.ts` — Auth module unit tests
- `client/tests/components/auth/__tests__/LoginPage.test.tsx` — Login page component tests
- `client/tests/components/admin/__tests__/UserCreatePage.test.tsx` — User creation form tests

### Implementation Patterns

**Session authentication flow:**

The `AuthController.login()` method programmatically authenticates via `AuthenticationManager`:

```java
@PostMapping("/api/auth/login")
public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest httpRequest) {
    UsernamePasswordAuthenticationToken token =
        new UsernamePasswordAuthenticationToken(request.getUsername(), request.getPassword());
    Authentication auth = authenticationManager.authenticate(token);
    SecurityContext context = SecurityContextHolder.createEmptyContext();
    context.setAuthentication(auth);
    SecurityContextHolder.setContext(context);
    HttpSession session = httpRequest.getSession(true);
    session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY, context);
    // return user info
}
```

**Password hashing in UserServiceImpl:**

```java
@Autowired
private PasswordEncoder passwordEncoder;

@Override
@Transactional
public void saveUser(User user) {
    // ... existing role validation and prefix logic ...
    user.setPassword(passwordEncoder.encode(user.getPassword()));
    userRepository.save(user);
}
```

**Frontend auth guard using react-router v2 `onEnter`:**

```typescript
const requireAuth = (nextState, replace, callback) => {
    checkSession().then(user => {
        if (!user) {
            replace({ pathname: '/login', state: { nextPathname: nextState.location.pathname } });
        }
        callback();
    }).catch(() => {
        replace({ pathname: '/login', state: { nextPathname: nextState.location.pathname } });
        callback();
    });
};
```

The `.catch()` handler is critical — without it, network errors (backend down, CORS failure) cause `callback()` to never be called, hanging the route transition indefinitely.

**CORS architecture:**

CORS is centralized as a shared `CorsConfigurationSource` bean in `WebSecurityConfig` (always active). Both `BasicAuthenticationConfig` (security enabled) and `DisableSecurityConfig` (security disabled) inject this bean and wire it via `.cors(cors -> cors.configurationSource(corsConfigurationSource))`. This avoids the previous issue where `WebSecurityConfig` defined its own `SecurityFilterChain` that conflicted with the auth chain.

**URL path normalization:**

```typescript
export const url = (path: string): string => `${BACKEND_URL}/${path.replace(/^\/+/, '')}`;
```

Leading slashes are stripped from paths to prevent double-slash URLs (e.g., `http://localhost:9966/petclinic//api/owners`). Double-slash paths bypass Spring Security's CORS pattern matching (`/**`), causing CORS preflight failures on POST/PUT/DELETE requests.

### Important Notes
- The `DisableSecurityConfig` (active when `petclinic.security.enable=false`) was modified to wire the shared CORS bean; when security is disabled, no session management or login is required — all endpoints are open with proper CORS headers
- The `petclinic.security.enable` property defaults to `true` in `application.properties` (changed from `false` during Phase 3) and `true` in `src/test/resources/application.properties`; backend tests run with security enabled
- `WebSecurityConfig` no longer defines a `SecurityFilterChain`; it only provides shared beans (`PasswordEncoder`, `CorsConfigurationSource`). The active `SecurityFilterChain` comes from either `BasicAuthenticationConfig` (security enabled) or `DisableSecurityConfig` (security disabled). This eliminates the previous conflict where two filter chains matched all requests.
- `SpringDataUserRepository` extends `Repository<User, Integer>` but `User.username` is a `String` `@Id` — this type mismatch is a known issue and is not addressed in this PRD
- Frontend components must use React 15 class component patterns (no hooks, no Context API)
- CORS `allowCredentials(true)` requires an explicit origin (not `*`); the existing `http://localhost:4444` origin satisfies this
- All frontend `fetch()` calls (both in `submitForm()` and bare component-level calls) must include `credentials: 'include'` for session cookies to be sent cross-origin

---

## Success Criteria

Phase 1:
- [x] `password` column is `VARCHAR(256)` in all three DB engine init scripts
- [x] A `PasswordEncoder` bean (bcrypt) is registered
- [x] `UserServiceImpl.saveUser()` hashes passwords before persisting
- [x] Seed data uses bcrypt-hashed passwords
- [x] Existing JDBC authentication works against bcrypt-hashed passwords
- [x] Backend tests pass (197/197)

Phase 2:
- [x] `POST /api/auth/login` authenticates valid credentials and returns user info with a session cookie
- [x] `POST /api/auth/login` returns 401 for invalid credentials
- [x] `POST /api/auth/logout` invalidates the session
- [x] `GET /api/auth/me` returns the authenticated user
- [x] `GET /api/auth/me` returns 401 when no session is present
- [x] All other `/api/**` endpoints require a valid session (when security is enabled)
- [x] CORS allows credentials and `DELETE` method
- [x] Backend tests pass (197/197)

Phase 3:
- [x] `/login` page renders a username/password form
- [x] Successful login redirects to `/`
- [x] Failed login displays an error message
- [x] All fetch calls include `credentials: 'include'`
- [x] Unauthenticated users are redirected to `/login` on any route
- [x] Route guard handles network errors gracefully (`.catch()`)
- [x] Navbar displays the current username
- [x] "Logout" in navbar invalidates the session and redirects to `/login`
- [x] Frontend tests pass (28/28)

Phase 4:
- [x] `/admin/users/new` renders a user creation form with role checkboxes
- [x] Form submits to `POST /api/users` and displays success/error feedback
- [x] Route is only accessible to users with `ROLE_ADMIN`; non-admins redirected to `/`
- [x] "Manage Users" nav item is visible only to `ADMIN` users
- [x] Frontend tests pass (38/38)

---

## Troubleshooting Guide

### Login returns 401 despite correct credentials
**Problem**: `POST /api/auth/login` returns 401 even with valid username/password
**Cause**: The `password` column may still contain `{noop}`-prefixed plaintext after Phase 1 migration, or the `PasswordEncoder` bean is not registered
**Solution**: Verify seed data uses bcrypt hashes (starts with `$2a$`); verify `PasswordEncoder` bean is present in the application context; restart the backend to re-initialize HSQLDB
**Code Reference**: `BasicAuthenticationConfig.java`, `populateDB.sql`

### Session cookie not sent by browser
**Problem**: After login, subsequent API calls return 401
**Cause**: `credentials: 'include'` is missing from frontend fetch calls, or CORS `allowCredentials` is not enabled
**Solution**: Verify all fetch calls include `credentials: 'include'`; verify `WebSecurityConfig` has `configuration.setAllowCredentials(true)`; verify the browser is not blocking third-party cookies
**Code Reference**: `util/index.tsx`, `WebSecurityConfig.java`

### CORS error on login request
**Problem**: Browser blocks the login request with a CORS error
**Cause**: `allowCredentials(true)` requires an explicit origin, not `*`. If the allowed origin does not match the frontend's actual origin, the request is blocked
**Solution**: Ensure `CorsConfigurationSource` bean in `WebSecurityConfig` includes the frontend's origin (`http://localhost:4444`)
**Code Reference**: `WebSecurityConfig.java`

### CORS preflight fails on POST/PUT/DELETE but GET works
**Problem**: Viewing data works but form submissions fail with "Failed to fetch"
**Cause**: Double-slash in the URL path (e.g., `/petclinic//api/owners`) bypasses Spring Security's CORS pattern matching (`/**`). GET requests don't require preflight; POST with `Content-Type: application/json` does. The `url()` utility previously concatenated `BACKEND_URL/` + `/api/...` producing double slashes.
**Solution**: The `url()` function strips leading slashes: `path.replace(/^\/+/, '')`. Verify paths passed to `submitForm()` and `url()` don't produce double slashes.
**Code Reference**: `client/src/util/index.tsx`

### Frontend redirects to /login in a loop
**Problem**: After login, the app immediately redirects back to `/login`
**Cause**: The `onEnter` auth guard calls `GET /api/auth/me` but the session cookie is not being sent, or the auth state module is not storing the user after login
**Solution**: Verify `credentials: 'include'` is set on the `/api/auth/me` fetch; verify the auth module updates `currentUser` after successful login; check browser dev tools for cookie presence
**Code Reference**: `auth/index.ts`, `configureRoutes.tsx`

### Route transitions hang / browser freezes
**Problem**: Navigating to a protected route causes the browser to hang indefinitely
**Cause**: The `requireAuth` `onEnter` guard calls `checkSession()` but has no `.catch()` handler. If the fetch rejects (backend down, CORS failure), `callback()` is never called and react-router's transition never completes.
**Solution**: Add `.catch()` to the `checkSession()` promise that redirects to `/login` and calls `callback()`.
**Code Reference**: `client/src/configureRoutes.tsx`

### "Failed to fetch" when security is disabled
**Problem**: Frontend fetch calls fail with "Failed to fetch" when `petclinic.security.enable=false`
**Cause**: `DisableSecurityConfig` was not wiring the shared `CorsConfigurationSource` bean, so cross-origin requests from `localhost:4444` were blocked
**Solution**: `DisableSecurityConfig` now injects and wires the same `CorsConfigurationSource` bean as `BasicAuthenticationConfig`
**Code Reference**: `DisableSecurityConfig.java`, `WebSecurityConfig.java`

### Multiple SecurityFilterChain beans conflict
**Problem**: Requests behave unpredictably — sometimes auth is enforced, sometimes not; CORS works for some requests but not others
**Cause**: `WebSecurityConfig` previously defined its own `SecurityFilterChain` (permit-all + CORS) alongside `BasicAuthenticationConfig`'s chain (require-auth, no CORS). Spring Security picks the first matching chain.
**Solution**: `WebSecurityConfig` no longer defines a `SecurityFilterChain`. It only provides shared beans. The active chain comes from either `BasicAuthenticationConfig` or `DisableSecurityConfig` exclusively.
**Code Reference**: `WebSecurityConfig.java`, `BasicAuthenticationConfig.java`

### Admin user creation returns "No static resource api/users"
**Problem**: `POST /api/users/` returns 400 with "No static resource api/users"
**Cause**: The Spring Boot endpoint is mapped to `/api/users` (no trailing slash). A trailing slash causes Spring to look for a static resource instead.
**Solution**: Use `api/users` (no trailing slash) in the `submitForm()` path.
**Code Reference**: `client/src/components/admin/UserCreatePage.tsx`

### Admin user creation returns 403
**Problem**: `POST /api/users` returns 403 Forbidden
**Cause**: The authenticated user does not have `ROLE_ADMIN`, or the role prefix is missing in the `roles` table
**Solution**: Verify the user's roles in the database include `ROLE_ADMIN` (with the `ROLE_` prefix); verify the session is valid
**Code Reference**: `UserRestController.java:49`, `Roles.java`

---

## Future Enhancements

- JWT-based authentication as an alternative to server-side sessions
- OAuth2 / OpenID Connect integration for SSO
- Password complexity requirements and validation
- User self-registration with email verification
- Account lockout after failed login attempts
- Audit logging for authentication events
- User listing and management CRUD (edit, disable, delete)
- "Remember me" functionality via persistent tokens
- Role-based UI element visibility beyond nav items (component-level authorization)
- CSRF protection re-enablement with token synchronization

---

## Dependencies

### Internal Dependencies
- `UserService` / `UserServiceImpl` — Password hashing and user persistence
- `Roles` component — Role constants consumed by `@PreAuthorize` on all controllers
- `ExceptionControllerAdvice` — Handles validation errors from auth and user creation endpoints
- `ClinicService` — Not directly used; all other domain endpoints rely on session validity enforced by Spring Security
- `client/src/util/index.tsx` — All frontend API calls flow through this module; credential inclusion affects the entire application

### External Dependencies
- Spring Security — Authentication, session management, and authorization framework
- Spring JDBC — JDBC-based user details service for credential verification
- `DelegatingPasswordEncoder` / `BCryptPasswordEncoder` — Password encoding
- MapStruct — `UserMapper` for entity/DTO conversion in user creation
- OpenAPI Generator — Generates `AuthApi` interface, `LoginRequestDto`, `AuthUserDto`, and updated `UsersApi`
- react-router v2 — `onEnter` hooks for route guards, `browserHistory` for programmatic navigation
- Bootstrap 3 — Styling for login and user creation forms

---

## Risks and Mitigation

### Technical Risks
- **Risk**: Bcrypt hashing increases login latency (~100ms per authentication)
- **Mitigation**: Bcrypt cost factor of 10 (default) is acceptable for this application's scale; tune only if latency becomes measurable

- **Risk**: Server-side sessions consume memory proportional to active users
- **Mitigation**: Configure session timeout (e.g., 30 minutes); for this application's expected user base, in-memory sessions via the default `HttpSession` are sufficient

- **Risk**: Multiple `SecurityFilterChain` beans may conflict on ordering
- **Mitigation**: RESOLVED — `WebSecurityConfig` no longer defines a `SecurityFilterChain`. Only one chain is active at a time: `BasicAuthenticationConfig` (security enabled) or `DisableSecurityConfig` (security disabled). Both wire the shared `CorsConfigurationSource` bean.

- **Risk**: `SpringDataUserRepository` generic type mismatch (`Repository<User, Integer>` but PK is `String`)
- **Mitigation**: Out of scope for this PRD; works by coincidence with current query methods. Document as known debt.

- **Risk**: HSQLDB re-creates schema on each restart; bcrypt seed data must be kept in sync across all three DB engines
- **Mitigation**: Generate the same bcrypt hash value and use it consistently across all `populateDB.sql` files

### User Experience Risks
- **Risk**: Users lose unsaved form data when session expires and they are redirected to `/login`
- **Mitigation**: Accept this limitation for now; future enhancement could add session-expiry warnings

- **Risk**: No "forgot password" flow exists
- **Mitigation**: Out of scope for this PRD; admin users can create replacement accounts

---

## Current Status

**Last Updated**: 2026-04-10
**Current Phase**: Complete
**Status**: All four phases implemented and verified
**Test Results**: 38 frontend tests, 197 backend tests — all passing
**Next Steps**: This PRD is fully implemented. See [Future Enhancements](#future-enhancements) for potential follow-on work.
