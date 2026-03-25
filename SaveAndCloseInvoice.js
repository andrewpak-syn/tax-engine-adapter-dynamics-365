// ============================
// Synexus Tax - Invoice Script (Save & Close)
// Stable Version
// ============================

async function fetchParameters(executionContext) {
    const formContext = executionContext && executionContext.getFormContext ? executionContext.getFormContext() : null;
    if (!formContext) {
        alert("Form context not available.");
        return;
    }

    try {
        Xrm.Utility.showProgressIndicator("Calculating taxes...");

        const invoiceNumber = getText(formContext, "invoicenumber");
        if (!invoiceNumber) {
            Xrm.Utility.closeProgressIndicator();
            alert("The invoice needs to be completed.");
            return;
        }

        const invoiceId = getEntityId(formContext);
        if (!invoiceId) {
            Xrm.Utility.closeProgressIndicator();
            alert("This invoice is not saved yet. Please save it first.");
            return;
        }

        const cfg = await getSynexusConfig();
        if (!cfg.url || !cfg.FunctionId || !cfg.clientFunction) {
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

        await calculateTaxAndUpdateLines(formContext, cfg, invoiceId, invoiceLines);

        await formContext.data.save({ saveMode: "saveandclose" });

        Xrm.Utility.closeProgressIndicator();
        await navigateToInvoiceList();
        alert("Tax updated Successfully");
    } catch (err) {
        Xrm.Utility.closeProgressIndicator();
        console.error("SynexusTax Error:", err);
        alert("Tax calculation failed. Check browser console logs for details.");
    }
}

async function calculateTaxAndUpdateLines(formContext, cfg, invoiceId, invoiceLines) {
    const endpoint = `${cfg.url}MGGetTaxForCart?Function=${enFunctionURIComponent(cfg.FunctionId)}`;

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
        testTransaction: false,
        clientID: cfg.clientFunction,
        customerID: customerId || "0",
        cartID: invoiceId,
        deliveredBySeller: true,
        pickup: false,
        Committed: true,
        FromAddress1: getText(formContext, "syn_fromaddress1"),
        FromAddress2: getText(formContext, "syn_fromaddress2"),
        FromCity: getText(formContext, "syn_fromcity"),
        FromZip: getText(formContext, "syn_fromzip"),
        FromState: getText(formContext, "syn_fromstate"),
        ToAddress1: getText(formContext, "shipto_line1"),
        ToAddress2: getText(formContext, "shipto_line2"),
        ToCity: getText(formContext, "shipto_city"),
        ToZip: getText(formContext, "shipto_postalFunction"),
        ToState: getText(formContext, "shipto_stateorprovince"),
        ToCountry: getText(formContext, "shipto_country"),
        cart: cart
    };

    const responseData = await postJson(endpoint, body);

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

async function navigateToInvoiceList() {
    const pageInput = {
        pageType: "entitylist",
        entityName: "invoice"
    };
    await Xrm.Navigation.navigateTo(pageInput);
}

async function getSynexusConfig() {
    const keys = ["craa5_syn_synexustaxurl", "craa5_syn_FunctionId", "craa5_syn_clientFunction"];
    const defFilter = keys.map(k => `schemaname eq '${k}'`).join(" or ");

    const defsResp = await Xrm.WebApi.retrieveMultipleRecords(
        "environmentvariabledefinition",
        `?$select=environmentvariabledefinitionid,schemaname,defaultvalue&$filter=${enFunctionURIComponent(defFilter)}`
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
            `?$select=value,_environmentvariabledefinitionid_value&$filter=${enFunctionURIComponent(valueFilter)}`
        );

        const values = valuesResp.entities || [];
        for (const v of values) {
            valueByDefId[v._environmentvariabledefinitionid_value] = v.value;
        }
    }

    const url = normalizeBaseUrl(pickEnvValue(defBySchema["craa5_syn_synexustaxurl"], valueByDefId));
    const FunctionId = safeTrim(pickEnvValue(defBySchema["craa5_syn_FunctionId"], valueByDefId));
    const clientFunction = safeTrim(pickEnvValue(defBySchema["craa5_syn_clientFunction"], valueByDefId));

    return { url, FunctionId, clientFunction };
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
    const query = `?$select=${select}&$filter=${enFunctionURIComponent(filter)}&$top=5000`;

    const resp = await Xrm.WebApi.retrieveMultipleRecords("invoicedetail", query);
    return resp.entities || [];
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

function getText(formContext, fieldName) {
    const attr = formContext.getAttribute(fieldName);
    if (!attr || !attr.getValue) return "";
    const val = attr.getValue();
    return safeTrim(val);
}
