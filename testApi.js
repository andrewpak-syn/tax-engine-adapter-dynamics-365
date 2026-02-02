// ============================
// Synexus Tax - Invoice Script (Test Transaction)
// Stable Version
// ============================

async function fetchParameters(executionContext) {
    const formContext = executionContext && executionContext.getFormContext ? executionContext.getFormContext() : null;
    if (!formContext) {
        alert("Form context not available.");
        return;
    }

    try {
        Xrm.Utility.showProgressIndicator("Testing tax calculation...");

        const invoiceId = getEntityId(formContext);
        if (!invoiceId) {
            Xrm.Utility.closeProgressIndicator();
            alert("This invoice is not saved yet. Please save it first.");
            return;
        }

        const cfg = await getSynexusConfig();
        if (!cfg.url || !cfg.secretCode || !cfg.clientCode) {
            Xrm.Utility.closeProgressIndicator();
            alert("Synexus Tax configuration is missing. Please check Environment Variables.");
            return;
        }

        const invoiceLines = await getInvoiceLines(invoiceId);
        if (!invoiceLines.length) {
            Xrm.Utility.closeProgressIndicator();
            alert("There are no products/lines to calculate taxes.");
            return;
        }

        await testSynexusAndUpdateLines(formContext, cfg, invoiceId, invoiceLines);

        await formContext.data.save();
        await formContext.data.refresh(false);

        Xrm.Utility.closeProgressIndicator();
        alert("Test tax updated successfully.");
    } catch (err) {
        Xrm.Utility.closeProgressIndicator();
        console.error("SynexusTax Test Error:", err);
        alert("Tax test failed. Check browser console logs for details.");
    }
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

function getEntityId(formContext) {
    const id = formContext.data && formContext.data.entity && formContext.data.entity.getId ? formContext.data.entity.getId() : "";
    return id ? id.replace(/[{}]/g, "") : "";
}

async function getInvoiceLines(invoiceId) {
    const select = [
        "invoicedetailid",
        "_productid_value",
        "quantity",
        "priceperunit",
        "tax"
    ].join(",");

    const filter = `_invoiceid_value eq ${wrapGuidForOData(invoiceId)}`;
    const query = `?$select=${select}&$filter=${encodeURIComponent(filter)}&$top=5000`;

    const resp = await Xrm.WebApi.retrieveMultipleRecords("invoicedetail", query);
    return resp.entities || [];
}

async function testSynexusAndUpdateLines(formContext, cfg, invoiceId, invoiceLines) {
    const url = `${cfg.url}MGGetTaxForCart?code=${encodeURIComponent(cfg.secretCode)}`;

    const getText = (field) => safeTrim(formContext.getAttribute(field) && formContext.getAttribute(field).getValue ? formContext.getAttribute(field).getValue() : "");

    const customerLookup = formContext.getAttribute("customerid") && formContext.getAttribute("customerid").getValue ? formContext.getAttribute("customerid").getValue() : null;
    const customerId = (customerLookup && customerLookup[0] && customerLookup[0].id) ? customerLookup[0].id.replace(/[{}]/g, "") : "";

    const cart = invoiceLines.map(line => ({
        ItemID: getProductIdentifier(line),
        Price: Number(line.priceperunit || 0),
        Quantity: Number(line.quantity || 0),
        LineTaxAmt: "0"
    }));

    const lineIdList = invoiceLines.map(l => l.invoicedetailid);

    const body = {
        facilityNumber: "0",
        testTransaction: true,
        clientID: cfg.clientCode,
        customerID: customerId || "0",
        cartID: invoiceId,
        deliveredBySeller: true,
        pickup: false,
        Committed: false,
        FromAddress1: getText("syn_fromaddress1"),
        FromAddress2: getText("syn_fromaddress2"),
        FromCity: getText("syn_fromcity"),
        FromZip: getText("syn_fromzip"),
        FromState: getText("syn_fromstate"),
        ToAddress1: getText("shipto_line1"),
        ToAddress2: getText("shipto_line2"),
        ToCity: getText("shipto_city"),
        ToZip: getText("shipto_postalcode"),
        ToState: getText("shipto_stateorprovince"),
        ToCountry: getText("shipto_country"),
        cart: cart
    };

    const responseData = await postJson(url, body);

    if (!responseData || !Array.isArray(responseData.cart)) {
        throw new Error("Invalid API response: missing cart.");
    }

    const updates = [];
    for (let i = 0; i < responseData.cart.length && i < lineIdList.length; i++) {
        const apiLine = responseData.cart[i];
        const newTaxValue = Number(apiLine && apiLine.LineTaxAmt ? apiLine.LineTaxAmt : 0);
        updates.push({ lineId: lineIdList[i], tax: newTaxValue });
    }

    for (const u of updates) {
        await Xrm.WebApi.updateRecord("invoicedetail", u.lineId, { tax: u.tax });
    }
}

function getProductIdentifier(line) {
    const formatted = line["_productid_value@OData.Community.Display.V1.FormattedValue"];
    if (safeTrim(formatted)) return formatted;
    return safeTrim(line._productid_value) || "N/A";
}

async function postJson(url, body) {
    const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
    });

    if (!resp.ok) {
        let text = "";
        try { text = await resp.text(); } catch (e) { }
        throw new Error(`HTTP ${resp.status} ${resp.statusText}. ${text}`);
    }

    return await resp.json();
}

function wrapGuidForOData(g) {
    const cleaned = safeTrim(g).replace(/[{}]/g, "");
    return `guid'${cleaned}'`;
}

function safeTrim(v) {
    return (v === null || v === undefined) ? "" : String(v).trim();
}
