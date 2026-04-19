# Approval Workflows

This document describes the approval workflow for each service in the Unified Workplace Demo, including which users and roles are involved.

---

## Users & Roles

| Name | Email | Role | Department | Reports To |
|---|---|---|---|---|
| Ahmed Al-Rashidi | ahmed@company.com | **admin** | IT | — (self) |
| Khalid Al-Mansouri | khalid@company.com | **manager** | Finance | Ahmed |
| Fatima Al-Zahra | fatima@company.com | **hr** | Human Resources | Khalid |
| Sara Hassan | sara@company.com | **employee** | Finance | Khalid |
| Omar Al-Farsi | omar@company.com | **employee** | IT | Ahmed |
| Mariam Al-Nouri | mariam@company.com | **manager** | Operations | Ahmed |

**Role visibility rules (apply to all services):**
- `employee` — sees only their own records
- `manager`, `hr`, `admin` — see all records

---

## 1. Leave Request

**Route:** `POST /api/leaves` → `PUT /api/leaves/:id`

### Flow

```
Employee submits leave
       ↓
Record created  (status: pending)
Task created    (type: approval, assigned to employee's direct manager)
       ↓
Manager approves or rejects
       ↓
Leave status updated  (approved / rejected)
Task status → completed
reviewedBy + reviewNote saved on record
```

### Who Does What

| Action | Who | Role Required |
|---|---|---|
| Submit leave request | Sara, Omar, Fatima, Mariam, Khalid | any |
| Approve / Reject Sara's leave | **Khalid** | manager of Sara (u002) |
| Approve / Reject Omar's leave | **Ahmed** | manager of Omar (u001) |
| Approve / Reject Fatima's leave | **Khalid** | manager of Fatima (u002) |
| Approve / Reject Mariam's leave | **Ahmed** | manager of Mariam (u001) |

### Example (Sara → Khalid)
1. Sara submits: `POST /api/leaves` with `{ type, startDate, endDate, days, reason }`
2. Task `"Approve Leave Request — Sara Hassan"` created and assigned to Khalid
3. Khalid approves: `PUT /api/leaves/:id` with `{ status: "approved", note: "..." }`
4. Leave record → `approved`, linked task → `completed`

---

## 2. Work From Home (WFH)

**Route:** `POST /api/wfh` → `PUT /api/wfh/:id`

### Flow

```
Employee submits WFH request
       ↓
Record created  (status: pending)
Task created    (type: approval, assigned to employee's direct manager)
       ↓
Manager approves or rejects
       ↓
WFH status updated  (approved / rejected)
Task status → completed
```

### Who Does What

| Action | Who | Role Required |
|---|---|---|
| Submit WFH request | Sara, Omar, Fatima, Mariam, Khalid | any |
| Approve / Reject Sara's WFH | **Khalid** | manager of Sara |
| Approve / Reject Omar's WFH | **Ahmed** | manager of Omar |

### Example (Sara → Khalid)
1. Sara submits: `POST /api/wfh` with `{ startDate, endDate, days, reason }`
2. Task `"Approve WFH Request — Sara Hassan"` created and assigned to Khalid
3. Khalid rejects: `PUT /api/wfh/:id` with `{ status: "rejected", note: "..." }`
4. WFH record → `rejected`, linked task → `completed`

---

## 3. Business Trip (Travel)

**Route:** `POST /api/travel` → `PUT /api/travel/:id`

### Flow

```
Employee books flights + hotel, then submits trip request
       ↓
Record created  (status: pending)
Task created    (type: approval, assigned to employee's direct manager)
Task priority → "high" if total cost > SAR 10,000, otherwise "medium"
       ↓
Manager approves or rejects
       ↓
Travel record status updated  (approved / rejected)
Task status → completed
```

### Who Does What

| Action | Who | Role Required |
|---|---|---|
| Search flights / hotels | any logged-in user | any |
| Submit trip request | Sara, Omar, Fatima, Mariam, Khalid | any |
| Approve / Reject Sara's trip | **Khalid** | manager of Sara |
| Approve / Reject Omar's trip | **Ahmed** | manager of Omar |

### Example (Sara → Khalid)
1. Sara searches: `GET /api/travel/search-flights?from=Riyadh&to=Dubai&date=...`
2. Sara submits: `POST /api/travel` with `{ destination, origin, purpose, departureDate, returnDate, days, flight, hotel, costBreakdown }`
3. Task `"Approve Business Trip — Sara Hassan"` created and assigned to Khalid
4. Khalid approves: `PUT /api/travel/:id` with `{ status: "approved", note: "..." }`
5. Travel record → `approved`, linked task → `completed`

---

## 4. Purchase Order (PO)

**Route:** `POST /api/purchase-orders` → `PUT /api/purchase-orders/:id/approve` or `/reject`

### Flow

```
User submits purchase order
       ↓
PO record created  (status: pending, poNumber: PO-YYYY-NNNN)
Task created only if managerId ≠ userId
Task assigned to employee's direct manager
       ↓
Manager approves or rejects
       ↓
PO status updated  (approved / rejected)
Task status → completed
```

> **Note:** Admin (Ahmed) submitting a PO does NOT create an approval task because his `managerId` points to himself.

### Who Does What

| Action | Who | Role Required |
|---|---|---|
| Submit PO | Sara, Omar, Fatima, Mariam, Khalid | any |
| Approve Sara's PO | **Khalid** | manager of Sara |
| Reject Sara's PO | **Khalid** | manager of Sara |
| Approve Omar's PO | **Ahmed** | manager of Omar |

### Example (Sara → Khalid)
1. Sara submits: `POST /api/purchase-orders` with `{ vendorId, vendorName, lineItems, grandTotal, costCenter, ... }`
2. Task `"Approve Purchase Order — PO-2026-NNNN"` created and assigned to Khalid
3. Khalid rejects: `PUT /api/purchase-orders/:id/reject` with `{ note: "..." }`
4. PO record → `rejected`, linked task → `completed`

---

## 5. Material Requisition (Warehouse)

**Route:** `POST /api/material-requisitions` → `PUT /api/material-requisitions/:id/approve` or `/reject`

### Flow

```
User submits material requisition
       ↓
MRQ record created  (status: pending, mrqNumber: MR-YYYY-NNNN)
Task created only if managerId ≠ userId
Task priority → "high" if priority = "urgent", otherwise "medium"
Task assigned to employee's direct manager
       ↓
Manager approves or rejects
       ↓
MRQ status updated  (approved / rejected)
Task status → completed
```

> **Note:** Same self-manager exclusion as PO — admin submitting an MRQ does not generate a task.

### Who Does What

| Action | Who | Role Required |
|---|---|---|
| Browse material catalog | any logged-in user | any |
| Submit requisition | Sara, Omar, Fatima, Mariam, Khalid | any |
| Approve Sara's MRQ | **Khalid** | manager of Sara |
| Reject Sara's MRQ | **Khalid** | manager of Sara |
| Approve Omar's MRQ | **Ahmed** | manager of Omar |

### Example (Sara → Khalid → approved)
1. Sara browses catalog: `GET /api/material-requisitions/materials?category=...`
2. Sara submits: `POST /api/material-requisitions` with `{ department, lineItems[], priority, deliveryLocation, requiredBy, ... }`
3. Task `"Approve Material Requisition — MR-2026-NNNN"` created and assigned to Khalid
4. Khalid approves: `PUT /api/material-requisitions/:id/approve` with `{ note: "..." }`
5. MRQ record → `approved`, linked task → `completed`

---

## 6. EMS — New Document Version

**Route:** `POST /api/ems/documents/:id/versions` → `POST /api/ems/documents/:id/versions/:version/approve` or `/reject`

### Flow

```
Any user uploads a new version of an existing document
       ↓
Version added with status: "pending"
currentVersion stays unchanged (not promoted yet)
Task created, assigned to the admin (Ahmed)
Document is blocked from further version uploads until resolved
       ↓
Admin approves or rejects
       ↓
Approve: version status → "approved", currentVersion bumped, task → completed
Reject:  version entry removed, physical file deleted, task → completed
```

### Who Does What

| Action | Who | Role Required |
|---|---|---|
| Upload new version | any logged-in user | any |
| Approve version | **Ahmed** | `admin` only |
| Reject version | **Ahmed** | `admin` only |

### Example
1. Sara uploads: `POST /api/ems/documents/:id/versions` (multipart, file field = `file`)
2. Task `"Approve new version of \"[Doc Title]\""` created and assigned to Ahmed (admin)
3. Ahmed approves: `POST /api/ems/documents/:id/versions/2/approve`
   - Version 2 status → `approved`
   - `currentVersion` → 2
   - Task → `completed`
4. Or Ahmed rejects: `POST /api/ems/documents/:id/versions/2/reject`
   - Version 2 entry removed from the document
   - Physical file deleted from disk
   - Task → `completed`

---

## Task Assignment Summary

| Submitter | Manager | Services Routed To Manager |
|---|---|---|
| Sara Hassan | **Khalid** | Leave, WFH, Travel, PO, MRQ |
| Fatima Al-Zahra | **Khalid** | Leave, WFH, Travel, PO, MRQ |
| Omar Al-Farsi | **Ahmed** | Leave, WFH, Travel, PO, MRQ |
| Mariam Al-Nouri | **Ahmed** | Leave, WFH, Travel, PO, MRQ |
| Khalid Al-Mansouri | **Ahmed** | Leave, WFH, Travel, PO, MRQ |
| Ahmed Al-Rashidi | *(self)* | Leave, WFH, Travel only — PO/MRQ skips task creation |
| Any user | **Ahmed** | EMS version uploads (always routed to admin) |

---

## Common Task Fields

Every approval task written to `data/tasks.json` shares this structure:

```json
{
  "id": "T<8-hex>",
  "title": "Approve [Service] — [identifier]",
  "type": "approval",
  "status": "pending",
  "assignedTo": "<managerId>",
  "createdBy": "<submitterId>",
  "sourceSystem": "HR | Procurement | Warehouse | EMS",
  "metadata": { "<serviceId>": "..." },
  "history": [
    { "action": "created", "by": "...", "at": "..." },
    { "action": "approved | rejected", "by": "...", "at": "..." }
  ]
}
```

On decision: `status` → `"completed"`, decision action appended to `history[]`.
