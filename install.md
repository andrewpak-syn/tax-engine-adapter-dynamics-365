# Synexus Tax Adapter for Dynamics 365  
**Installation & Configuration Guide (Stable Version)**

This document describes how to install and configure the Synexus Tax integration Plugin for Microsoft Dynamics 365 using JavaScript Web Resources and Ribbon Workbench.

---

## 1. Prerequisites

- Microsoft Dynamics 365 instance (Sandbox or Production)
- System Customizer or System Administrator role
- Access to **Power Apps Maker Portal**
- **Ribbon Workbench** (managed solution) installed
- Synexus API credentials:
  - Base URL
  - Secret Code
  - Client Code

---

## 2. Install Ribbon Workbench

1. Go to **Power Apps** → https://make.powerapps.com  
2. Select your environment.
3. Open **Solutions**.
4. Click **Import Solution**.
5. Upload the **Ribbon Workbench managed solution**.
6. Complete the import.

---

## 3. Create Unmanaged Solution

1. Go to **Solutions**.
2. Click **New solution**.
3. Name: `Synexus Tax Integration`
4. Publisher: Default or custom
5. Version: `1.0.0.0`
6. Save.
7. Open the solution.
8. Click **Add existing** → **Table**.
9. Select **Invoice**.
10. Choose **No components**.
11. Save.

---

## 4. Create Environment Variables

Create the following **Environment Variable Definitions**:

| Schema Name       | Display Name        | Type | Default Value              |
|-------------------|---------------------|------|----------------------------|
| syn_synexustaxurl | Synexus Tax URL     | Text | https://your-api-url/      |
| syn_secretcode    | Synexus Secret Code | Text | Provided by Synexus        |
| syn_clientcode    | Synexus Client Code | Text | Provided by Synexus        |

**Steps**

1. Open `Synexus Tax Integration` solution.
2. Click **New** → **More** → **Environment Variable**.
3. Create all three variables.
4. Set their **Current Value**.

---

## 5. Upload JavaScript Web Resources

1. Open `Synexus Tax Integration`.
2. Click **New** → **Web Resource**.
3. Name: `syn_synexus_tax_stable.js`
4. Type: **Script (JScript)**
5. Upload the stable version JS file.
6. Save and **Publish**.

---

## 6. Configure Ribbon Buttons

### 6.1 Open Ribbon Workbench

1. Go to **Solutions**.
2. Open `Synexus Tax Integration`.
3. Click **Open in Ribbon Workbench**.

---

### 6.2 Clone Buttons on Invoice Form

#### A. Clone **Save** Button → Test Tax

1. Select **Invoice** entity.
2. Go to **Main Form** → **Command Bar**.
3. Locate **Save**.
4. Right-click → **Clone**.
5. Rename: `Test Synexus Tax`
6. Label: `Test Tax`
7. Add **JavaScript Action**:
   - Library: `syn_synexus_tax_stable.js`
   - Function: `fetchParameters`
   - Pass Execution Context: **Yes**

---

#### B. Clone **Save** Button → Commit Tax

1. Clone **Save** again.
2. Rename: `Commit Synexus Tax`
3. Label: `Commit Tax`
4. Action:
   - Library: `syn_synexus_tax_stable.js`
   - Function: `fetchParameters`
   - Pass Execution Context: **Yes**

---

#### C. Clone **Cancel** Button → Cancel Transaction

1. Select **Cancel** button.
2. Clone.
3. Rename: `Cancel Synexus Tax`
4. Label: `Cancel Tax`
5. Action:
   - Library: `syn_synexus_tax_stable.js`
   - Function: `CacelTransaction`
   - Pass Execution Context: **Yes**

---

### 6.3 Publish Ribbon

1. Click **Publish** in Ribbon Workbench.
2. Close Ribbon Workbench.

---

## 7. Publish All Customizations

1. Go to **Solutions**.
2. Select `Synexus Tax Integration`.
3. Click **Publish All Customizations**.

---

## 8. Functional Flow

| Button        | Action |
|---------------|--------|
| **Test Tax**  | Calls Synexus with test flag and updates invoice line taxes |
| **Commit Tax**| Commits transaction to Synexus and updates invoice |
| **Cancel Tax**| Cancels transaction in Synexus and voids invoice |

---

## 9. Security Notes

- Secrets are stored in **Environment Variables**.
- No credentials are hardcoded.
- API calls run from the client browser.

---

## 10. Version

**Release:** Stable  
**Target Entity:** Invoice  
**Technology:** JavaScript Web Resources + Ribbon Workbench
