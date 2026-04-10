# Authentication & Authorization - Technical PRD

## Overview

This document describes the authentication and authorization domain of the Spring PetClinic ReactJS application. The system provides user credential storage, role-based access control (RBAC) with three role tiers, and a toggleable HTTP Basic authentication mechanism. The frontend currently has no login UI or user-management pages, making this the least-developed domain in the application.

---

## Business Requirements

### User Management
- Administrators can create user accounts with a username, password, and one or more roles
- Each user must have at least one role assigned at creation time
- User accounts can be enabled or disabled

### Role-Based Access Control
- The system defines three roles: `OWNER_ADMIN`, `VET_ADMIN`, and `ADMIN`
- `OWNER_ADMIN` grants access to owner, pet, and visit management endpoints
- `VET_ADMIN` grants access to veterinarian, specialty, and pet-type management endpoints
- `ADMIN` grants access to user-creation endpoints
- When security is disabled (default), all endpoints are accessible without authentication

### Security Configuration
- Security is toggled via the `petclinic.security.enable` property (default: `false`)
- When enabled, all API endpoints require HTTP Basic authentication
- When disabled, all API endpoints are open (permit-all)

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE users (
  username    VARCHAR(20) NOT NULL,
  password    VARCHAR(20) NOT NULL,
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

Unique constraint: `(username, role)` on the `roles` table (enforced via JPA `@UniqueConstraint`).

**Seed data** (single admin user with all three roles):

```sql
INSERT INTO users(username, password, enabled) VALUES ('admin', '{noop}admin', true);

INSERT INTO roles (username, role) VALUES ('admin', 'ROLE_OWNER_ADMIN');
INSERT INTO roles (username, role) VALUES ('admin', 'ROLE_VET_ADMIN');
INSERT INTO roles (username, role) VALUES ('admin', 'ROLE_ADMIN');
```

### API Endpoints

#### POST /api/users/
**Description:** Create a new user account.

**Authorization:** `hasRole(ROLE_ADMIN)`

**Request Body:**
```json
{
  "username": "john.doe",
  "password": "1234abc",
  "enabled": true,
  "roles": [
    { "name": "OWNER_ADMIN" }
  ]
}
```

**Behavior:**
- `UserServiceImpl` validates that at least one role is provided (throws `IllegalArgumentException` otherwise)
- Role names are auto-prefixed with `ROLE_` if not already present
- Each `Role` entity's `user` back-reference is set if null

**Response:**
- Success (201 Created): Returns the created `UserDto`
- Error (400): Missing roles or validation failure

### User Interface Requirements

**No frontend UI currently exists for this domain.** There is:
- No login page or login form
- No user registration page
- No user management / admin panel
- No role assignment UI
- No logout mechanism
- No session or token display

---

## Implementation Phases

### Phase 1: Current State (Backend Only) - COMPLETED

**Objective**: Backend user creation and RBAC infrastructure

**Existing deliverables**:
1. `User` and `Role` JPA entities with `@OneToMany` cascade
2. `UserRepository` with three persistence implementations (Spring Data JPA, JPA, JDBC)
3. `UserService` / `UserServiceImpl` with role normalization logic
4. `UserRestController` implementing generated `UsersApi`
5. `UserMapper` (MapStruct) for entity/DTO conversion
6. Three `SecurityFilterChain` configurations (`WebSecurityConfig`, `DisableSecurityConfig`, `BasicAuthenticationConfig`)
7. JDBC-based authentication against `users`/`roles` tables when security is enabled
8. Backend test coverage via `UserRestControllerTests` and `AbstractUserServiceTests` (three profile variants)

### Phase 2: Frontend Authentication UI - PLANNED

**Objective**: Add login/logout capability to the React SPA

**Tasks**:
1. Build a login page component with username/password form
2. Implement HTTP Basic header injection on all API calls
3. Add logout functionality (clear stored credentials)
4. Display current user in the navbar
5. Protect frontend routes based on user roles

### Phase 3: Security Hardening - PLANNED

**Objective**: Production-grade authentication

**Tasks**:
1. Replace HTTP Basic with JWT or session-based auth
2. Add password hashing (currently `{noop}` prefix = plaintext)
3. Add CSRF protection (currently disabled)
4. Implement user management CRUD UI (list, create, edit, disable users)

---

## Technical Implementation Details

### Key Files

**Backend:**
- `src/main/java/org/springframework/samples/petclinic/model/User.java` — Entity; `@Id` is `username` (String), not auto-generated integer
- `src/main/java/org/springframework/samples/petclinic/model/Role.java` — Entity; extends `BaseEntity` (integer `id`), links to `User` via `@ManyToOne` on `username`
- `src/main/java/org/springframework/samples/petclinic/service/UserServiceImpl.java` — Role prefix normalization and back-reference wiring
- `src/main/java/org/springframework/samples/petclinic/rest/controller/UserRestController.java` — Single `addUser` endpoint
- `src/main/java/org/springframework/samples/petclinic/security/Roles.java` — `@Component` exposing role constants for SpEL `@PreAuthorize` expressions
- `src/main/java/org/springframework/samples/petclinic/security/WebSecurityConfig.java` — CORS config (allows `http://localhost:4444`)
- `src/main/java/org/springframework/samples/petclinic/security/BasicAuthenticationConfig.java` — HTTP Basic + JDBC auth (active when `petclinic.security.enable=true`)
- `src/main/java/org/springframework/samples/petclinic/security/DisableSecurityConfig.java` — Permit-all (active when `petclinic.security.enable=false`)

**Config:**
- `src/main/resources/application.properties` — `petclinic.security.enable=false`
- `src/test/resources/application.properties` — `petclinic.security.enable=true` (tests run with security on)

### Implementation Patterns

The `UserService` is isolated from `ClinicService`. While all other domain services go through the shared `ClinicService` facade, user operations use a dedicated `UserService` / `UserServiceImpl` that injects only `UserRepository`. This separation means user management has no transactional coupling with the rest of the application.

Role-based controller authorization uses SpEL expressions that reference the `Roles` Spring component:
```java
@PreAuthorize("hasRole(@roles.ADMIN)")
```

### Important Notes
- `SpringDataUserRepository` extends `Repository<User, Integer>` but `User.username` is a `String` `@Id` — the generic type parameter is incorrect and works only because Spring Data ignores it for custom method signatures
- Password storage uses `{noop}` prefix (plaintext) with `DelegatingPasswordEncoder`
- The `WebSecurityConfig` and `BasicAuthenticationConfig` both define `SecurityFilterChain` beans; Spring Security orders them by `@Order` or declaration sequence, which could produce unexpected behavior
- CORS allows only `http://localhost:4444` — production deployments need this updated
- `DELETE` is not listed in CORS allowed methods, though some controllers define `@DeleteMapping`

---

## Success Criteria

- [x] Users can be created via `POST /api/users/` with roles
- [x] Role names are automatically prefixed with `ROLE_`
- [x] User creation requires `ADMIN` role (when security is enabled)
- [x] JDBC authentication works against `users`/`roles` tables
- [x] Security can be toggled via `petclinic.security.enable`

---

## Troubleshooting Guide

### Users cannot authenticate
**Problem**: 401 Unauthorized on all requests when security is enabled
**Cause**: `petclinic.security.enable` must be set to `true` in `application.properties`, and the `users`/`roles` tables must be populated (HSQLDB re-creates from seed data on each restart; MySQL/PostgreSQL require manual initialization)
**Solution**: Verify the property is `true`, restart the backend, and confirm seed data exists
**Code Reference**: `BasicAuthenticationConfig.java:42-48`

### Role prefix mismatch
**Problem**: `AccessDeniedException` despite correct role assignment
**Cause**: `UserServiceImpl` prefixes roles with `ROLE_` on save, but if a role was inserted directly into the database without the prefix, `@PreAuthorize` checks will fail
**Solution**: Ensure all role values in the `roles` table start with `ROLE_`
**Code Reference**: `UserServiceImpl.java:25-28`

---

## Future Enhancements

- JWT-based authentication replacing HTTP Basic
- OAuth2 / OpenID Connect integration for SSO
- Password complexity requirements and bcrypt hashing
- User self-registration (with email verification)
- Account lockout after failed login attempts
- Audit logging for authentication events
- Frontend admin panel for user CRUD operations
- Role-based UI element visibility (hide nav items by role)

---

## Dependencies

### Internal Dependencies
- `ClinicService` — Not used; `UserService` operates independently
- `Roles` component — Provides role constants consumed by `@PreAuthorize` on all controllers
- `ExceptionControllerAdvice` — Handles validation errors from user creation

### External Dependencies
- Spring Security — Authentication and authorization framework
- Spring JDBC — JDBC-based user details service (`BasicAuthenticationConfig`)
- MapStruct — `UserMapper` for entity/DTO conversion
- OpenAPI Generator — Generates `UsersApi` interface and `UserDto`/`RoleDto` classes

---

## Risks and Mitigation

### Technical Risks
- **Risk**: Plaintext passwords (`{noop}`) are a security vulnerability
- **Mitigation**: Migrate to bcrypt encoding before enabling security in any non-development environment

- **Risk**: `SpringDataUserRepository` generic type mismatch (`Integer` vs `String` PK)
- **Mitigation**: Correct the generic type to `Repository<User, String>` when modifying user persistence

- **Risk**: Multiple `SecurityFilterChain` beans may conflict on ordering
- **Mitigation**: Add explicit `@Order` annotations when adding new security configurations

### User Experience Risks
- **Risk**: No frontend authentication UI means the API is either fully open or accessible only via tools like curl/Postman
- **Mitigation**: Build a login page before enabling security in user-facing environments

---

## Current Status

**Last Updated**: 2026-04-08
**Current Phase**: Phase 1 - Backend Only (Complete)
**Status**: Backend RBAC infrastructure is functional but security is disabled by default. No frontend authentication exists.
**Next Steps**: Design and implement a frontend login page; decide on authentication strategy (HTTP Basic vs JWT vs session)
