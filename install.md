# Synexus Tax Adapter for Dynamics 365  
**Installation & Configuration Guide (Stable Version)**

This document provides a complete guide to install, configure, and validate the **Synexus Tax Integration** for Microsoft Dynamics 365 (Model-Driven Apps).

The integration uses **JavaScript Web Resources**, **Environment Variables**, and **Command Bar customization** to interact with the Synexus Tax API during Invoice operations.

---

## 1. Overview

The Synexus Tax Adapter enables:

- Real-time tax calculation (Test mode)
- Transaction commit to Synexus
- Transaction cancellation
- Automatic tax update on Invoice lines

### Architecture Summary

- Frontend: JavaScript (Web Resource)
- Configuration: Environment Variables (Dataverse)
- UI Integration: Command Bar (Ribbon / Modern Command Designer)
- API Communication: REST calls to Synexus Tax Engine

---

## 2. Prerequisites

Ensure the following before starting:

### Platform Requirements

- Microsoft Dynamics 365 (Sales / Model-Driven App)
- Access to **Power Apps Maker Portal**
- Environment: Sandbox or Production
- Security Role:
  - System Administrator **or**
  - System Customizer

### Required Tools

- (Optional) **Ribbon Workbench**
- OR **Modern Command Designer (Recommended)**

### Synexus API Credentials

You must obtain:

- Base URL (e.g. `https://api.synexus.com/`)
- Client Code
- Secret Code

---

## 3. Important Notes (Critical)

### ⚠️ Environment Variable Prefix

Dynamics automatically prefixes schema names with the publisher prefix.

Example:

| Defined Name | Actual Schema Name |
|-------------|------------------|
| syn_synexustaxurl | crca4_syn_synexustaxurl |
| syn_secretcode    | crca4_syn_secretcode |
| syn_clientcode    | crca4_syn_clientcode |

👉 Your JavaScript **must use the real schema names**, otherwise configuration will fail at runtime.

---

### ⚠️ Required Custom Fields on Invoice

The following fields must exist in the **Invoice table**:

- syn_fromaddress1
- syn_fromaddress2
- syn_fromcity
- syn_fromzip
- syn_fromstate

These are required to build the origin address sent to Synexus.

---

## 4. Create Unmanaged Solution

1. Go to **Power Apps** → https://make.powerapps.com  
2. Select your environment  
3. Open **Solutions**  
4. Click **New solution**

Fill:

- Name: `Synexus Tax Integration`
- Publisher: Default or custom
- Version: `1.0.0.0`

Then:

5. Open the solution  
6. Click **Add existing → Table**  
7. Select **Invoice**  
8. Choose **No components**  
9. Save  

---

## 5. Create Environment Variables

Create the following variables:

| Schema Name       | Display Name        | Type | Description |
|-------------------|---------------------|------|-------------|
| syn_synexustaxurl | Synexus Tax URL     | Text | Base API endpoint |
| syn_secretcode    | Synexus Secret Code | Text | Authentication key |
| syn_clientcode    | Synexus Client Code | Text | Client identifier |

### Steps

1. Open your solution  
2. Click **New → More → Environment Variable**  
3. Create all variables  
4. Set **Current Value** (mandatory)  

---

## 6. Upload JavaScript Web Resource

1. Open solution  
2. Click **New → Web Resource**

Fill:

- Name: `syn_synexus_tax_stable.js`
- Display Name: Synexus Tax Script
- Type: Script (JScript)

3. Upload JS file  
4. Save  
5. Click **Publish**

---

## 7. Configure Command Bar Buttons

> Recommended: Use **Modern Command Designer**  
> Ribbon Workbench can still be used for legacy environments.

---

### 7.1 Buttons Overview

| Button | Function |
|--------|----------|
| Test Tax | Simulates tax calculation |
| Commit Tax | Finalizes transaction |
| Cancel Tax | Cancels Synexus transaction |

---

### 7.2 Configure Buttons (Modern Approach)

1. Open Model-Driven App  
2. Go to **Invoice table**  
3. Open **Command Bar editor**

---

### A. Test Tax Button

- Label: `Test Tax`
- Action:
  - JavaScript Function: `fetchParameters`
  - Library: `syn_synexus_tax_stable.js`
  - Pass execution context: Yes

---

### B. Commit Tax Button

- Label: `Commit Tax`
- Action:
  - Function: `fetchParameters`

- Behavior:
  - Must send:
    ```
    committed = true
    testTransaction = false
    ```

---

### C. Cancel Tax Button

- Label: `Cancel Tax`
- Function: CancelTransaction


---

## 8. Optional (Recommended): OnSave Integration

Instead of relying only on buttons, you can trigger Synexus automatically:

### Strategy

Use **Form OnSave event**

### Behavior

- On Save:
- Call Synexus API
- Send transaction as committed
- Update taxes

### Benefit

- Eliminates need for “Commit Tax” button
- Ensures consistency across all invoice creations

---

## 9. Publish Customizations

1. Go to **Solutions**
2. Select your solution
3. Click: Publish All Customizations


---

## 10. Functional Flow

### Test Flow

1. User clicks **Test Tax**
2. System sends invoice data to Synexus (test mode)
3. Response returns tax values
4. Invoice lines updated

---

### Commit Flow

1. User saves invoice OR clicks Commit
2. System sends final transaction
3. Synexus stores transaction
4. Invoice updated with final tax values

---

### Cancel Flow

1. User clicks Cancel Tax
2. Synexus transaction is canceled
3. Invoice updated accordingly

---

## 11. Debugging & Logs

Use browser console: Console.

Key logs:

- Invoice ID
- Customer
- Currency
- Total Amount
- API request payload
- API response

---

## 12. Security Considerations

- Secrets stored in **Dataverse Environment Variables**
- No credentials hardcoded in scripts
- API calls executed client-side

⚠️ Recommendation:

For production-grade security, consider:

- Moving API calls to a **server-side plugin or Azure Function**
- Avoid exposing secret code in browser requests

---

## 13. Known Limitations

- Client-side execution exposes API endpoint
- Depends on correct environment variable schema names
- Requires invoice form customization
- No retry mechanism on API failure (unless implemented manually)

---

## 14. Version

- Release: Stable  
- Entity: Invoice (`invoice`)  
- Technology:
  - JavaScript Web Resources
  - Dataverse Environment Variables
  - Command Bar Customization

---

## 15. Roadmap / Improvements

- Server-side integration (Plugin / Azure Function)
- Retry mechanism for failed transactions
- Logging table in Dataverse
- UI status indicator (Tax Status)
- Multi-environment configuration support

