// ==========================================
// Synexus Tax - Cancel / Delete Invoice
// Clean Stable Debug Version
// Custom button flow:
// 1) Call Synexus CancelTransaction
// 2) Always try to delete Dataverse invoice
// 3) Log what was sent and what came back
// ==========================================

// =====================================================
// 1) ENVIRONMENT VARIABLE SCHEMA NAMES
// =====================================================
const CANCEL_ENV_TAX_URL = "crca4_syn_synexustaxurl";
const CANCEL_ENV_SECRET_Function = "crca4_syn_FunctionId";
const CANCEL_ENV_CLIENT_Function = "crca4_syn_clientFunction";

// =====================================================
// 2) PUBLIC ENTRY POINT FOR COMMAND BAR
// =====================================================
async function CancelTransaction(primaryControl) {
    return CancelTransactionAndDelete(primaryControl);
}

// =====================================================
// 3) MAIN ENTRY POINT
// =====================================================
async function CancelTransactionAndDelete(primaryControl) {
    console.log("==================================================");
    console.log("=== Synexus Cancel/Delete START ===");

    try {
        if (!primaryControl) {
            console.error("PrimaryControl not received.");
            await showCancelDialog("PrimaryControl was not passed to the JavaScript function.");
            return;
        }

        const formContext = primaryControl;
        console.log("FormContext:", formContext);

        Xrm.Utility.showProgressIndicator("Cancelling Synexus transaction and deleting invoice...");

        const invoiceId = getCancelEntityId(formContext);
        console.log("Invoice ID:", invoiceId);

        if (!invoiceId) {
            Xrm.Utility.closeProgressIndicator();
            console.warn("Invoice not saved yet. Nothing to cancel/delete.");
            await showCancelDialog("Please save the invoice before cancelling/deleting it.");
            return;
        }

        const cleanInvoiceId = invoiceId.replace(/[{}]/g, "");
        console.log("Clean Invoice ID / CartID:", cleanInvoiceId);

        const invoiceNumber = getCancelTextField(formContext, "invoicenumber");
        console.log("Invoice Number:", invoiceNumber);

        console.log("=== Loading environment variables config ===");
        const config = await getSynexusCancelConfig();

        console.log("Resolved Synexus Cancel Config:", {
            url: config.url,
            FunctionId: config.FunctionId ? "[present]" : "[missing]",
            clientFunction: config.clientFunction ? "[present]" : "[missing]"
        });

        if (!config.url || !config.clientFunction) {
            console.error("Missing Synexus configuration.", config);
            Xrm.Utility.closeProgressIndicator();
            await showCancelDialog("Synexus configuration is missing. Please verify environment variables.");
            return;
        }

        const confirmStrings = {
            text: `This will call Synexus CancelTransaction and then permanently delete invoice ${invoiceNumber || cleanInvoiceId}. Do you want to continue?`,
            title: "Confirm invoice deletion"
        };
        const confirmOptions = { height: 220, width: 500 };

        const confirmResult = await Xrm.Navigation.openConfirmDialog(confirmStrings, confirmOptions);
        console.log("Delete confirmation result:", confirmResult);

        if (!confirmResult || !confirmResult.confirmed) {
            Xrm.Utility.closeProgressIndicator();
            console.warn("User cancelled the delete operation.");
            return;
        }

        console.log("=== Calling Synexus CancelTransaction API ===");
        const cancelResult = await cancelSynexusTransactionApi(config, cleanInvoiceId);
        console.log("Synexus CancelTransaction final result:", cancelResult);

        console.log("=== Deleting Dataverse invoice (always attempted) ===");
        let deleteResponse = null;
        let deleteSucceeded = false;
        let deleteErrorMessage = "";

        try {
            deleteResponse = await Xrm.WebApi.deleteRecord("invoice", cleanInvoiceId);
            deleteSucceeded = true;
            console.log("Dataverse delete response:", deleteResponse);
        } catch (deleteError) {
            deleteSucceeded = false;
            deleteErrorMessage = deleteError && deleteError.message ? deleteError.message : String(deleteError);
            console.error("Dataverse delete failed:", deleteError);
        }

        Xrm.Utility.closeProgressIndicator();

        console.log("=== Synexus Cancel/Delete END ===");
        console.log("Summary:", {
            synexusOk: cancelResult.ok,
            synexusStatus: cancelResult.status,
            synexusStatusText: cancelResult.statusText,
            deleteSucceeded: deleteSucceeded,
            deleteErrorMessage: deleteErrorMessage
        });
        console.log("==================================================");

        let finalMessage = "";

        if (deleteSucceeded && cancelResult.ok) {
            finalMessage = "Invoice deleted. Synexus cancel succeeded.";
        } else if (deleteSucceeded && !cancelResult.ok) {
            finalMessage = `Invoice deleted. Synexus cancel returned ${cancelResult.status || 0}.`;
        } else if (!deleteSucceeded && cancelResult.ok) {
            finalMessage = "Synexus cancel succeeded, but invoice deletion failed.";
        } else {
            finalMessage = "Synexus cancel and invoice deletion both failed.";
        }

        await showCancelDialog(finalMessage);

        if (deleteSucceeded) {
            try {
                formContext.ui.close();
            } catch (closeError) {
                console.warn("Could not close form after delete.", closeError);
            }
        }
    } catch (error) {
        Xrm.Utility.closeProgressIndicator();
        console.error("=== Synexus Cancel/Delete ERROR ===", error);
        console.error("Error message:", error && error.message ? error.message : error);
        console.error("Error stack:", error && error.stack ? error.stack : "No stack");
        console.log("==================================================");

        await showCancelDialog("Cancel/delete failed unexpectedly. Check browser console logs.");
    }
}

// =====================================================
// 4) SYNEXUS CANCEL API
// =====================================================
async function cancelSynexusTransactionApi(config, cartId) {
    console.log("cancelSynexusTransactionApi() START");
    console.log("Input cartId:", cartId);

    const baseUrl = normalizeCancelApiBaseUrl(config.url);
    const clientFunction = stripTrailingDotCancel(config.clientFunction);

    const finalUrl = `${baseUrl}CancelTransaction?CartID=${enFunctionURIComponent(cartId)}&ClientID=${enFunctionURIComponent(clientFunction)}`;

    console.log("Synexus CancelTransaction final URL:", finalUrl);

    const requestInfo = {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        cartId: cartId,
        clientFunction: clientFunction
    };
    console.log("Synexus CancelTransaction request info:", requestInfo);

    try {
        const response = await fetch(finalUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            }
        });

        console.log("Synexus CancelTransaction HTTP status:", response.status, response.statusText);

        let responseText = "";
        try {
            responseText = await response.text();
            console.log("Synexus CancelTransaction raw response text:", responseText);
        } catch (e) {
            console.warn("Could not read CancelTransaction response text.", e);
        }

        let parsedResponse = null;
        try {
            parsedResponse = responseText ? JSON.parse(responseText) : null;
        } catch (e) {
            parsedResponse = null;
        }

        const result = {
            ok: response.ok,
            status: response.status,
            statusText: response.statusText,
            raw: responseText,
            parsed: parsedResponse,
            url: finalUrl
        };

        console.log("cancelSynexusTransactionApi() END", result);
        return result;
    } catch (fetchError) {
        const result = {
            ok: false,
            status: 0,
            statusText: "FETCH_ERROR",
            raw: "",
            parsed: null,
            url: finalUrl,
            errorMessage: fetchError && fetchError.message ? fetchError.message : String(fetchError)
        };

        console.error("Synexus CancelTransaction fetch error:", fetchError);
        console.log("cancelSynexusTransactionApi() END", result);
        return result;
    }
}

// =====================================================
// 5) CONFIG LOADER
// =====================================================
async function getSynexusCancelConfig() {
    console.log("getSynexusCancelConfig() START");

    const configFromEnv = {
        url: "",
        FunctionId: "",
        clientFunction: ""
    };

    try {
        const keys = [
            CANCEL_ENV_TAX_URL,
            CANCEL_ENV_SECRET_Function,
            CANCEL_ENV_CLIENT_Function
        ];
        console.log("Environment keys to resolve:", keys);

        const defFilter = keys.map(k => `schemaname eq '${k}'`).join(" or ");
        console.log("Environment definition filter:", defFilter);

        const defsResp = await Xrm.WebApi.retrieveMultipleRecords(
            "environmentvariabledefinition",
            `?$select=environmentvariabledefinitionid,schemaname,defaultvalue&$filter=${enFunctionURIComponent(defFilter)}`
        );

        console.log("Environment definitions response:", defsResp);

        const defs = defsResp.entities || [];
        const defBySchema = {};

        for (const d of defs) {
            defBySchema[d.schemaname] = d;
        }

        console.log("Definitions found:", defs);

        const defIds = defs
            .map(d => d.environmentvariabledefinitionid)
            .filter(Boolean);

        console.log("Definition IDs:", defIds);

        const valueByDefId = {};

        if (defIds.length) {
            const valueFilter = defIds
                .map(id => `_environmentvariabledefinitionid_value eq ${wrapCancelGuidForOData(id)}`)
                .join(" or ");

            console.log("Environment value filter:", valueFilter);

            const valuesResp = await Xrm.WebApi.retrieveMultipleRecords(
                "environmentvariablevalue",
                `?$select=value,_environmentvariabledefinitionid_value&$filter=${enFunctionURIComponent(valueFilter)}`
            );

            console.log("Environment values response:", valuesResp);

            const values = valuesResp.entities || [];
            for (const v of values) {
                valueByDefId[v._environmentvariabledefinitionid_value] = v.value;
            }

            console.log("Values found:", values);
            console.log("Values by definition ID:", valueByDefId);
        } else {
            console.warn("No environment variable definitions found.");
        }

        const rawUrl = pickCancelEnvValue(defBySchema[CANCEL_ENV_TAX_URL], valueByDefId);
        const rawFunctionId = pickCancelEnvValue(defBySchema[CANCEL_ENV_SECRET_Function], valueByDefId);
        const rawClientFunction = pickCancelEnvValue(defBySchema[CANCEL_ENV_CLIENT_Function], valueByDefId);

        console.log("Raw URL from env:", rawUrl);
        console.log("Raw Secret Function from env present:", !!rawFunctionId);
        console.log("Raw Client Function from env present:", !!rawClientFunction);

        configFromEnv.url = normalizeCancelConfigUrl(rawUrl);
        configFromEnv.FunctionId = safeTrimCancel(rawFunctionId);
        configFromEnv.clientFunction = safeTrimCancel(rawClientFunction);
    } catch (envError) {
        console.error("Environment variable resolution failed.", envError);
    }

    console.log("getSynexusCancelConfig() END", {
        url: configFromEnv.url,
        FunctionId: configFromEnv.FunctionId ? "[present]" : "[missing]",
        clientFunction: configFromEnv.clientFunction ? "[present]" : "[missing]"
    });

    return configFromEnv;
}

function pickCancelEnvValue(def, valueByDefId) {
    console.log("pickCancelEnvValue() definition:", def);

    if (!def) return "";

    const current = valueByDefId[def.environmentvariabledefinitionid];
    const selected = safeTrimCancel(current) || safeTrimCancel(def.defaultvalue) || "";

    console.log("pickCancelEnvValue() selected value for", def.schemaname, "=>", selected ? "[present]" : "[missing]");
    return selected;
}

// =====================================================
// 6) HELPERS
// =====================================================
function getCancelEntityId(formContext) {
    const id = formContext.data && formContext.data.entity && formContext.data.entity.getId
        ? formContext.data.entity.getId()
        : "";

    console.log("getCancelEntityId() =>", id);
    return id || "";
}

function getCancelTextField(formContext, fieldName) {
    try {
        const attr = formContext.getAttribute(fieldName);
        if (!attr) {
            console.warn(`Field [${fieldName}] not found on form.`);
            return "";
        }

        const value = attr.getValue();
        const cleanValue = safeTrimCancel(value);
        console.log(`Text field [${fieldName}] =>`, cleanValue);
        return cleanValue;
    } catch (e) {
        console.warn(`Could not read text field [${fieldName}]`, e);
        return "";
    }
}

function normalizeCancelConfigUrl(url) {
    url = safeTrimCancel(url);
    console.log("normalizeCancelConfigUrl() input:", url);

    if (!url) return "";

    return url.endsWith("/") ? url : url + "/";
}

function normalizeCancelApiBaseUrl(url) {
    const clean = safeTrimCancel(url);
    console.log("normalizeCancelApiBaseUrl() input:", clean);

    if (!clean) return "";

    return clean.endsWith("/") ? clean : clean + "/";
}

function stripTrailingDotCancel(value) {
    const clean = safeTrimCancel(value);
    const normalized = clean.endsWith(".") ? clean.slice(0, -1) : clean;
    console.log("stripTrailingDotCancel() input:", value, "output:", normalized);
    return normalized;
}

function wrapCancelGuidForOData(guid) {
    const cleaned = safeTrimCancel(guid).replace(/[{}]/g, "");
    console.log("wrapCancelGuidForOData() input:", guid, "output:", cleaned);
    return cleaned;
}

function safeTrimCancel(value) {
    return value === null || value === undefined ? "" : String(value).trim();
}

async function showCancelDialog(message) {
    try {
        console.log("showCancelDialog() =>", message);
        await Xrm.Navigation.openAlertDialog({ text: message });
    } catch (e) {
        console.warn("Could not show cancel dialog:", e);
    }
}