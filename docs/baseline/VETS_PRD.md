# Veterinarians & Specialties - Technical PRD

## Overview

This document describes the Veterinarians and Specialties domain of the Spring PetClinic ReactJS application. Veterinarians are practitioners who may have zero or more specialties (e.g., radiology, surgery, dentistry). The two entities are linked by a many-to-many relationship. The backend provides full CRUD for both vets and specialties, but the frontend only has a read-only vet listing page — there is no UI for managing vets or specialties.

---

## Business Requirements

### Veterinarian Management
- Users can view a list of all veterinarians with their specialties
- Veterinary administrators can create, update, and delete veterinarian records
- When creating or updating a vet, specialties are resolved by name against existing specialty records
- A vet can have zero or more specialties

### Specialty Management
- Specialties define areas of expertise that can be assigned to veterinarians
- Veterinary administrators can create, update, and delete specialties
- Deleting a specialty must also remove it from all vet-specialty associations
- Specialty names should be unique in practice (no database constraint enforces this)

---

## Technical Requirements

### Database Schema

```sql
CREATE TABLE vets (
  id         INTEGER IDENTITY PRIMARY KEY,
  first_name VARCHAR(30),
  last_name  VARCHAR(30)
);
CREATE INDEX vets_last_name ON vets (last_name);

CREATE TABLE specialties (
  id   INTEGER IDENTITY PRIMARY KEY,
  name VARCHAR(80)
);
CREATE INDEX specialties_name ON specialties (name);

CREATE TABLE vet_specialties (
  vet_id       INTEGER NOT NULL,
  specialty_id INTEGER NOT NULL
);
ALTER TABLE vet_specialties ADD CONSTRAINT fk_vet_specialties_vets
  FOREIGN KEY (vet_id) REFERENCES vets (id);
ALTER TABLE vet_specialties ADD CONSTRAINT fk_vet_specialties_specialties
  FOREIGN KEY (specialty_id) REFERENCES specialties (id);
```

**Seed data** (6 vets, 3 specialties, 5 associations):

Vets: James Carter, Helen Leary, Linda Douglas, Rafael Ortega, Henry Stevens, Sharon Jenkins.

Specialties: radiology, surgery, dentistry.

Associations: Helen Leary → radiology; Linda Douglas → surgery, dentistry; Rafael Ortega → surgery; Henry Stevens → radiology. James Carter and Sharon Jenkins have no specialties.

### API Endpoints

#### Vet Endpoints (`VetRestController`)

All protected with `@PreAuthorize("hasRole(@roles.VET_ADMIN)")`.

##### GET /api/vets
**Description:** List all veterinarians with their specialties.

**Response:**
- Success (200): Array of `VetDto` (includes nested `specialties` array)
- Not Found (404): Empty body when no vets exist

##### GET /api/vets/{vetId}
**Response:**
- Success (200): `VetDto`
- Not Found (404): Empty body

##### POST /api/vets
**Request Body:**
```json
{
  "firstName": "James",
  "lastName": "Carter",
  "specialties": [
    { "name": "radiology" }
  ]
}
```

**Behavior:** The controller resolves specialties by name via `findSpecialtiesByNameIn`. If a specialty name doesn't match an existing record, it is silently dropped from the vet's specialty list. Only pre-existing specialties can be assigned.

**Response:**
- Success (201 Created): `VetDto` with `Location` header

##### PUT /api/vets/{vetId}
**Behavior:** Clears all existing specialties and re-assigns from the request body. Specialties are again resolved by name.

**Response:**
- Success (204 No Content): Returns `VetDto` in body (inconsistent with 204 semantics)
- Not Found (404): Empty body

##### DELETE /api/vets/{vetId}
**Behavior:** Deletes the vet and all `vet_specialties` associations.

**Response:**
- Success (204 No Content)
- Not Found (404): Empty body

#### Specialty Endpoints (`SpecialtyRestController`)

All protected with `@PreAuthorize("hasRole(@roles.VET_ADMIN)")`.

##### GET /api/specialties
**Description:** List all specialties.

**Response:**
- Success (200): Array of `SpecialtyDto` (`{ id, name }`)
- Not Found (404): Empty body when no specialties exist

##### GET /api/specialties/{specialtyId}
**Response:**
- Success (200): `SpecialtyDto`
- Not Found (404): Empty body

##### POST /api/specialties
**Request Body:**
```json
{
  "name": "dermatology"
}
```

**Response:**
- Success (201 Created): `SpecialtyDto` with `Location` header

##### PUT /api/specialties/{specialtyId}
**Response:**
- Success (204 No Content): Returns `SpecialtyDto` in body
- Not Found (404): Empty body

##### DELETE /api/specialties/{specialtyId}
**Behavior:** Deletes the specialty and all `vet_specialties` associations referencing it. All three persistence implementations (Spring Data JPA, JPA, JDBC) explicitly delete from `vet_specialties` before removing the specialty row.

**Response:**
- Success (204 No Content)
- Not Found (404): Empty body

### User Interface Requirements

#### Veterinarians Page (/vets)
- Fetches vet list from `GET /api/vets` on mount
- Displays a table with two columns: Name, Specialties
- Specialties are joined with commas; "none" is displayed for vets without specialties
- Guards against non-OK responses: `response.ok ? response.json() : []`
- No create, edit, or delete functionality in the UI
- No individual vet detail page

#### Specialty Management
- **No frontend UI exists for specialty management**
- Specialties can only be managed via direct API calls

---

## Technical Implementation Details

### Key Files

**Backend — Entities:**
- `src/main/java/org/springframework/samples/petclinic/model/Vet.java` — Extends `Person` → `BaseEntity`. `@ManyToMany` EAGER fetch to `Specialty` via join table `vet_specialties`. Provides `addSpecialty()`, `clearSpecialties()`, `getNrOfSpecialties()`. Returns sorted specialties (by name).
- `src/main/java/org/springframework/samples/petclinic/model/Specialty.java` — Extends `NamedEntity` → `BaseEntity`. No additional fields.

**Backend — Repositories:**
- `src/main/java/org/springframework/samples/petclinic/repository/VetRepository.java` — `findAll()`, `findById(int)`, `save(Vet)`, `delete(Vet)`
- `src/main/java/org/springframework/samples/petclinic/repository/SpecialtyRepository.java` — Standard CRUD + `findSpecialtiesByNameIn(Set<String>)` for batch lookup by name
- JDBC implementations manually manage `vet_specialties` join table entries in `save()` and `delete()` methods
- Spring Data JPA specialty deletion uses `SpecialtyRepositoryOverride` with `EntityManager` to clear `vet_specialties` via native SQL before deleting

**Backend — Controllers:**
- `src/main/java/org/springframework/samples/petclinic/rest/controller/VetRestController.java` — Implements `VetsApi`; injects `SpecialtyMapper` in addition to `VetMapper` for specialty resolution
- `src/main/java/org/springframework/samples/petclinic/rest/controller/SpecialtyRestController.java` — Implements `SpecialtiesApi`

**Backend — Mappers:**
- `src/main/java/org/springframework/samples/petclinic/mapper/VetMapper.java` — Uses `SpecialtyMapper` for nested specialty conversion
- `src/main/java/org/springframework/samples/petclinic/mapper/SpecialtyMapper.java` — `Specialty` ↔ `SpecialtyDto`

**Frontend:**
- `client/src/components/vets/VetsPage.tsx` — Read-only vet list; single stateful class component

**TypeScript types:**
- `IVet` in `client/src/types/index.ts` — `{ firstName, lastName, specialties: ISpecialty[] }` extends `IPerson`
- `ISpecialty` — `{ name }` extends `INamedEntity`

### Implementation Patterns

The `VetRestController.addVet` and `updateVet` methods implement a **specialty resolution** pattern: they extract specialty names from the incoming DTO, batch-query existing specialties via `findSpecialtiesByNameIn`, and replace the vet's specialties with the resolved entities. This ensures only pre-existing specialties are assigned — you cannot create a new specialty as a side effect of vet creation.

The JDBC implementation of `VetRepository.findAll()` uses a three-step pattern: (1) query all vets, (2) query all specialties, (3) for each vet, query their specialty IDs from `vet_specialties` and resolve against the full specialty list. This avoids N+1 queries at the cost of loading all specialties into memory.

### Important Notes
- OpenAPI documents `200` for `addVet` and `updateVet`, but the controller returns `201` and `204` respectively — spec/implementation drift
- `updateVet` clears and re-assigns all specialties on every update; there is no "add specialty" or "remove specialty" granular operation
- The `Vet` entity uses `@XmlElement` on `getSpecialties()` (leftover from XML serialization support); this has no effect on JSON responses
- The JDBC vet deletion explicitly deletes from `vet_specialties` before `vets` to avoid FK constraint violations
- `VetsPage.tsx` uses a constructor without arguments (`constructor() { super(); }`) — deprecated in React class component patterns

---

## Success Criteria

- [x] Veterinarian list page displays all vets with their specialties
- [x] Frontend handles empty vet list gracefully
- [x] Backend CRUD works for vets (create, read, update, delete)
- [x] Backend CRUD works for specialties (create, read, update, delete)
- [x] Specialty resolution by name works on vet creation/update
- [x] Specialty deletion cascades to `vet_specialties` associations
- [x] Backend tests cover vet and specialty operations across all three persistence profiles

---

## Troubleshooting Guide

### Specialty not assigned to vet after creation
**Problem**: A vet is created with specialties but none are saved
**Cause**: `findSpecialtiesByNameIn` returns empty when the specialty names don't match existing records (case-sensitive match)
**Solution**: Verify specialty names match exactly. Create specialties via `POST /api/specialties` before assigning them to vets.
**Code Reference**: `VetRestController.java:91-93`

### Deleting a specialty causes FK violation
**Problem**: `DataIntegrityViolationException` when deleting a specialty
**Cause**: The `vet_specialties` rows were not cleaned up before the specialty was deleted. This can happen if a custom repository implementation omits the join-table cleanup.
**Solution**: All three standard implementations handle this correctly. If a fourth implementation is added, ensure it deletes from `vet_specialties WHERE specialty_id=:id` before deleting the specialty.
**Code Reference**: `SpringDataSpecialtyRepositoryImpl.java:38-42`

---

## Future Enhancements

- Add vet CRUD forms to the frontend (create, edit, delete)
- Add specialty management UI accessible to `VET_ADMIN` users
- Add individual vet detail page with full specialty information
- Add vet search by name or specialty
- Add vet availability/scheduling (not currently modeled)
- Display vet information on visit detail views

---

## Dependencies

### Internal Dependencies
- **ClinicService** — Facade for all vet and specialty repository operations
- **Auth domain** — `VET_ADMIN` role required for all vet and specialty endpoints

### External Dependencies
- MapStruct — `VetMapper` (uses `SpecialtyMapper`), `SpecialtyMapper` for entity/DTO conversion
- Bootstrap 3 — Table styling on `VetsPage`
- OpenAPI Generator — Generates `VetsApi`, `SpecialtiesApi` interfaces and DTO classes

---

## Risks and Mitigation

### Technical Risks
- **Risk**: Specialty resolution is name-based and case-sensitive — a typo silently drops the specialty assignment
- **Mitigation**: Validate specialty names against existing records before submission; return an error if a name doesn't match

- **Risk**: `updateVet` clears all specialties and re-adds — if the request omits specialties, all existing assignments are lost
- **Mitigation**: Document that the specialties array must be complete on every PUT request; consider adding partial update support

- **Risk**: OpenAPI spec and controller status codes are out of sync (200 vs 201/204)
- **Mitigation**: Update `openapi.yml` to match actual controller responses

### User Experience Risks
- **Risk**: No vet management UI means adding or editing vets requires direct API calls
- **Mitigation**: Build vet CRUD forms before exposing these operations to non-technical users

- **Risk**: The vet list page has no pagination — large vet rosters could cause slow rendering
- **Mitigation**: Implement server-side pagination with page/size parameters

---

## Current Status

**Last Updated**: 2026-04-08
**Current Phase**: Phase 1 - Read-Only Frontend (Complete)
**Status**: Backend full CRUD is functional for both vets and specialties. Frontend displays a read-only vet list with specialties. No management UI exists.
**Next Steps**: Build vet detail page, add vet CRUD forms, add specialty management UI
