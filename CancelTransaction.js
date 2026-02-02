// ============================
// Synexus Tax - Cancel Transaction Script
// Stable Version
// ============================

async function CacelTransaction(executionContext) {
    const formContext = executionContext && executionContext.getFormContext ? executionContext.getFormContext() : null;
    if (!formContext) {
        alert("Form context not available.");
        return;
    }

    try {
        Xrm.Utility.showProgressIndicator("Cancelling transaction...");

        const cartId = getText(formContext, "invoicenumber");
        if (!cartId) {
            Xrm.Utility.closeProgressIndicator();
            alert("You need to create an Invoice before cancelling.");
            return;
        }

        const cfg = await getSynexusConfig();
        if (!cfg.url || !cfg.clientCode) {
            Xrm.Utility.closeProgressIndicator();
            alert("Synexus Tax configuration is missing. Please check Environment Variables.");
            return;
        }

        await CancelTransactionApi(cfg.url, cfg.clientCode, cartId);

        formContext.getAttribute("statecode").setValue(3);
        await formContext.data.save();

        Xrm.Utility.closeProgressIndicator();
        alert("Transaction canceled successfully.");
    } catch (err) {
        Xrm.Utility.closeProgressIndicator();
        console.error("SynexusTax Cancel Error:", err);
        alert("Cancel transaction failed. Check browser console logs for details.");
    }
}

async function CancelTransactionApi(baseUrl, clientCode, cartId) {
    const url = `${normalizeBaseUrl(baseUrl)}CancelTransaction?CartID=${encodeURIComponent(cartId)}&ClientID=${encodeURIComponent(clientCode)}`;

    const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" }
    });

    if (!response.ok) {
        let text = "";
        try { text = await response.text(); } catch (e) { }
        throw new Error(`HTTP ${response.status} ${response.statusText}. ${text}`);
    }

    return true;
}

async function getSynexusConfig() {
    const keys = ["syn_synexustaxurl", "syn_secretcode", "syn_clientcode"];
    const defFilter = keys.map(k => `schemaname eq '${k}'`).join(" or ");

    const defsResp = await Xrm.WebApi.retrieveMultipleRecords(
        "environmentvariabledefinition",
        `?$select=environmentvariabledefinitionid,schemaname,defaultvalue&$filter=${encodeURIComponent(defFilter)}`
    );

    const defs = defsResp.entities || [];
    const defBySchema = {};
    for (const d of defs) defBySchema[d.schemaname] = d;

    const defIds = defs.map(d => d.environmentvariabledefinitionid).filter(Boolean);

    let valueByDefId = {};
    if (defIds.length) {
        const valueFilter = defIds.map(id => `_environmentvariabledefinitionid_value eq ${wrapGuidForOData(id)}`).join(" or ");
        const valuesResp = await Xrm.WebApi.retrieveMultipleRecords(
            "environmentvariablevalue",
            `?$select=value,_environmentvariabledefinitionid_value&$filter=${encodeURIComponent(valueFilter)}`
        );

        const values = valuesResp.entities || [];
        for (const v of values) {
            valueByDefId[v._environmentvariabledefinitionid_value] = v.value;
        }
    }

    const url = normalizeBaseUrl(pickEnvValue(defBySchema["syn_synexustaxurl"], valueByDefId));
    const secretCode = safeTrim(pickEnvValue(defBySchema["syn_secretcode"], valueByDefId));
    const clientCode = safeTrim(pickEnvValue(defBySchema["syn_clientcode"], valueByDefId));

    return { url, secretCode, clientCode };
}

function pickEnvValue(def, valueByDefId) {
    if (!def) return "";
    const current = valueByDefId && valueByDefId[def.environmentvariabledefinitionid];
    return safeTrim(current) || safeTrim(def.defaultvalue) || "";
}

function normalizeBaseUrl(url) {
    url = safeTrim(url);
    if (!url) return "";
    return url.endsWith("/") ? url : (url + "/");
}

function wrapGuidForOData(g) {
    const cleaned = safeTrim(g).replace(/[{}]/g, "");
    return `guid'${cleaned}'`;
}

function safeTrim(v) {
    return (v === null || v === undefined) ? "" : String(v).trim();
}

function getText(formContext, fieldName) {
    const attr = formContext.getAttribute(fieldName);
    if (!attr || !attr.getValue) return "";
    return safeTrim(attr.getValue());
}
