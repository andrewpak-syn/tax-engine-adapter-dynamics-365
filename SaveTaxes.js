// ==========================================
// Synexus Tax - Full Debug Version
// Invoice Main Form Button
// With fallback config + ShipTo logic
// ==========================================

// =====================================================
// 1) ENVIRONMENT VARIABLE SCHEMA NAMES
// =====================================================

const ENV_TAX_URL = "crca4_syn_synexustaxurl";
const ENV_SECRET_CODE = "crca4_syn_FunctionId";
const ENV_CLIENT_CODE = "crca4_syn_clientcode";


// =====================================================
// 3) ADDRESS FALLBACKS
// =====================================================
const FALLBACK_FROM_ADDRESS = {
    line1: "1600 Amphitheatre Parkway",
    line2: "",
    city: "Mountain View",
    zip: "94043",
    state: "CA"
};

const FALLBACK_TO_ADDRESS = {
    line1: "123 Default St",
    line2: "",
    line3: "",
    city: "Seattle",
    zip: "98101",
    state: "WA",
    country: "USA"
};

async function fetchParameters(primaryControl) {
    console.log("==================================================");
    console.log("=== Synexus Tax START ===");
    console.log("Received primaryControl:", primaryControl);

    try {
        if (!primaryControl) {
            console.error("PrimaryControl not received.");
            await showDialog("PrimaryControl was not passed to the JavaScript function.");
            return;
        }

        const formContext = primaryControl;
        console.log("FormContext:", formContext);

        Xrm.Utility.showProgressIndicator("Calculating Synexus taxes...");

        const invoiceId = getEntityId(formContext);
        console.log("Invoice ID:", invoiceId);

        if (!invoiceId) {
            console.warn("Invoice not saved yet.");
            Xrm.Utility.closeProgressIndicator();
            await showDialog("Please save the invoice before calculating taxes.");
            return;
        }

        const customer = getLookupValue(formContext, "customerid");
        console.log("Customer:", customer);

        const currency = getLookupValue(formContext, "transactioncurrencyid");
        console.log("Currency:", currency);

        const totalAmount = getAttributeValue(formContext, "totalamount");
        console.log("Total Amount:", totalAmount);

        console.log("=== Loading environment variables / fallback config ===");
        const config = await getSynexusConfig();
        console.log("Resolved Synexus Config:", {
            url: config.url,
            clientCode: config.clientCode ? "[present]" : "[missing]"
        });

        if (!config.url || !config.clientCode) {
            console.error("Missing Synexus configuration.", config);
            Xrm.Utility.closeProgressIndicator();
            await showDialog("Synexus configuration is missing.");
            return;
        }

        console.log("=== Loading invoice lines ===");
        const invoiceLines = await getInvoiceLines(invoiceId);
        console.log("Invoice lines loaded:", invoiceLines);

        if (!invoiceLines.length) {
            console.warn("No invoice lines found.");
            Xrm.Utility.closeProgressIndicator();
            await showDialog("No invoice lines found for this invoice.");
            return;
        }

        console.log("=== Building request body ===");
        const requestBody = buildSynexusRequestBody(formContext, config, invoiceId, invoiceLines);
        console.log("Synexus Request Body:", JSON.stringify(requestBody, null, 2));

        console.log("=== Calling Synexus API ===");
        const responseData = await callSynexusApi(config, requestBody);
        console.log("Synexus API Response:", responseData);

        console.log("=== Applying tax updates to invoice lines ===");
        await applyTaxUpdates(invoiceLines, responseData);

        console.log("=== Saving and refreshing form ===");
        await formContext.data.save();
        await formContext.data.refresh(false);

        Xrm.Utility.closeProgressIndicator();
        console.log("=== Synexus Tax SUCCESS ===");
        console.log("==================================================");

        await showDialog("Synexus tax calculation completed successfully.");
    } catch (error) {
        Xrm.Utility.closeProgressIndicator();
        console.error("=== Synexus Tax ERROR ===", error);
        console.error("Error message:", error && error.message ? error.message : error);
        console.error("Error stack:", error && error.stack ? error.stack : "No stack");
        console.log("==================================================");

        await showDialog("Synexus tax calculation failed. Check browser console logs.");
    }
}

async function getSynexusConfig() {
    console.log("getSynexusConfig() START");

    const configFromEnv = {
        url: "",
        FunctionId: "",
        clientCode: ""
    };

    try {
        const keys = [ENV_TAX_URL, ENV_SECRET_CODE, ENV_CLIENT_CODE];
        console.log("Environment keys to resolve:", keys);

        const defFilter = keys.map(k => `schemaname eq '${k}'`).join(" or ");
        console.log("Environment definition filter:", defFilter);

        const defsResp = await Xrm.WebApi.retrieveMultipleRecords(
            "environmentvariabledefinition",
            `?$select=environmentvariabledefinitionid,schemaname,defaultvalue&$filter=${encodeURIComponent(defFilter)}`
        );

        console.log("Environment definitions response:", defsResp);

        const defs = defsResp.entities || [];
        const defBySchema = {};

        for (const d of defs) {
            defBySchema[d.schemaname] = d;
        }

        console.log("Definitions found:", defs);
        console.log("Definitions by schema:", defBySchema);
        console.log("Expected ENV_TAX_URL:", ENV_TAX_URL, "=>", defBySchema[ENV_TAX_URL] ? "FOUND" : "MISSING");
        console.log("Expected ENV_SECRET_CODE:", ENV_SECRET_CODE, "=>", defBySchema[ENV_SECRET_CODE] ? "FOUND" : "MISSING");
        console.log("Expected ENV_CLIENT_CODE:", ENV_CLIENT_CODE, "=>", defBySchema[ENV_CLIENT_CODE] ? "FOUND" : "MISSING");

        const defIds = defs
            .map(d => d.environmentvariabledefinitionid)
            .filter(Boolean);

        console.log("Definition IDs:", defIds);

        const valueByDefId = {};

        if (defIds.length) {
            const valueFilter = defIds
                .map(id => `_environmentvariabledefinitionid_value eq ${wrapGuidForOData(id)}`)
                .join(" or ");

            console.log("Environment value filter:", valueFilter);

            const valuesResp = await Xrm.WebApi.retrieveMultipleRecords(
                "environmentvariablevalue",
                `?$select=value,_environmentvariabledefinitionid_value&$filter=${encodeURIComponent(valueFilter)}`
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

        const rawUrl = pickEnvValue(defBySchema[ENV_TAX_URL], valueByDefId);
        const rawFunctionId = pickEnvValue(defBySchema[ENV_SECRET_CODE], valueByDefId);
        const rawClientCode = pickEnvValue(defBySchema[ENV_CLIENT_CODE], valueByDefId);

        console.log("Raw URL from env:", rawUrl);
        console.log("Raw Secret Code from env present:", !!rawFunctionId);
        console.log("Raw Client Code from env present:", !!rawClientCode);

        configFromEnv.url = normalizeApiBaseUrl(rawUrl);
        configFromEnv.FunctionId = safeTrim(rawFunctionId);
        configFromEnv.clientCode = safeTrim(rawClientCode);
        } catch (envError) {
        console.error("Environment variable resolution failed.", envError);
    }

    console.log("getSynexusConfig() END", {
        url: configFromEnv.url,
        FunctionId: configFromEnv.FunctionId ? "[present]" : "[missing]",
        clientCode: configFromEnv.clientCode ? "[present]" : "[missing]"
    });

    return configFromEnv;
    }

function pickEnvValue(def, valueByDefId) {
    console.log("pickEnvValue() definition:", def);

    if (!def) return "";

    const current = valueByDefId[def.environmentvariabledefinitionid];
    const selected = safeTrim(current) || safeTrim(def.defaultvalue) || "";

    console.log("pickEnvValue() selected value for", def.schemaname, "=>", selected ? "[present]" : "[missing]");
    return selected;
}

async function getInvoiceLines(invoiceId) {
    console.log("getInvoiceLines() START with invoiceId:", invoiceId);

    const cleanInvoiceId = invoiceId.replace(/[{}]/g, "");
    console.log("Clean Invoice ID:", cleanInvoiceId);

    const query =
        "?$select=invoicedetailid,_productid_value,quantity,priceperunit,tax,baseamount,extendedamount" +
        "&$filter=_invoiceid_value eq " + cleanInvoiceId;

    console.log("Invoice lines query:", query);

    const result = await Xrm.WebApi.retrieveMultipleRecords("invoicedetail", query);
    console.log("Raw invoice lines result:", result);

    const lines = result.entities || [];
    console.log("Invoice lines count:", lines.length);

    lines.forEach((line, index) => {
        console.log(`--- Invoice Line ${index + 1} ---`);
        console.log("InvoiceDetail ID:", line.invoicedetailid);
        console.log("Product ID:", line._productid_value);
        console.log("Product Name:", line["_productid_value@OData.Community.Display.V1.FormattedValue"]);
        console.log("Quantity:", line.quantity);
        console.log("Price Per Unit:", line.priceperunit);
        console.log("Tax:", line.tax);
        console.log("Base Amount:", line.baseamount);
        console.log("Extended Amount:", line.extendedamount);
    });

    console.log("getInvoiceLines() END");
    return lines;
}

function buildSynexusRequestBody(formContext, config, invoiceId, invoiceLines) {
    console.log("buildSynexusRequestBody() START");

    const customerLookup = getLookupValue(formContext, "customerid");
    const customerId = customerLookup && customerLookup.id ? customerLookup.id.replace(/[{}]/g, "") : "";
    console.log("Customer ID:", customerId);

    const cart = invoiceLines.map((line, index) => {
        const item = {
            ItemID: getProductIdentifier(line),
            Price: Number(line.priceperunit || 0),
            Quantity: Number(line.quantity || 0),
            LineTaxAmt: "0"
        };

        console.log(`Cart item ${index + 1}:`, item);
        return item;
    });

    console.log("=== Resolving ShipTo fields from Invoice ===");

    const toAddress1 = getTextFieldOrFallback(formContext, "shipto_line1", FALLBACK_TO_ADDRESS.line1);
    const toAddress2 = getTextFieldOrFallback(formContext, "shipto_line2", FALLBACK_TO_ADDRESS.line2);
    const toAddress3 = getTextFieldOrFallback(formContext, "shipto_line3", FALLBACK_TO_ADDRESS.line3);
    const toCity = getTextFieldOrFallback(formContext, "shipto_city", FALLBACK_TO_ADDRESS.city);
    const toZip = getTextFieldOrFallback(formContext, "shipto_postalcode", FALLBACK_TO_ADDRESS.zip);
    const toState = getTextFieldOrFallback(formContext, "shipto_stateorprovince", FALLBACK_TO_ADDRESS.state);

    const rawShipToCountry = getTextFieldOrFallback(formContext, "shipto_country", FALLBACK_TO_ADDRESS.country);

    console.log("Resolved ShipTo address:", {
        toAddress1,
        toAddress2,
        toAddress3,
        toCity,
        toZip,
        toState,
        rawShipToCountry
    });

    const finalToAddress1 = mergeAddressLines(toAddress1, toAddress2, toAddress3);
    console.log("Final ToAddress1 after merge:", finalToAddress1);

    const body = {
        facilityNumber: "0",
        testTransaction: true,
        clientID: "VENN",
         entityID: "496",
        customerID: customerId || "0",
        cartID: invoiceId.replace(/[{}]/g, ""),
        deliveredBySeller: true,
        pickup: false,
        Committed: false,

        // FROM ADDRESS (hardcoded for now)
        FromAddress1: FALLBACK_FROM_ADDRESS.line1,
        FromAddress2: FALLBACK_FROM_ADDRESS.line2,
        FromCity: FALLBACK_FROM_ADDRESS.city,
        FromZip: FALLBACK_FROM_ADDRESS.zip,
        FromState: FALLBACK_FROM_ADDRESS.state,

        // TO ADDRESS (from Invoice ShipTo with fallback)
        ToAddress1: finalToAddress1,
        ToAddress2: "",
        ToCity: toCity,
        ToZip: toZip,
        ToState: toState,
        ToCountry: "USA",

        cart: cart
    };

    console.log("Final FROM address:", {
        FromAddress1: body.FromAddress1,
        FromAddress2: body.FromAddress2,
        FromCity: body.FromCity,
        FromZip: body.FromZip,
        FromState: body.FromState
    });

    console.log("Final TO address:", {
        ToAddress1: body.ToAddress1,
        ToAddress2: body.ToAddress2,
        ToCity: body.ToCity,
        ToZip: body.ToZip,
        ToState: body.ToState,
        ToCountry: body.ToCountry
    });

    console.log("buildSynexusRequestBody() END");
    return body;
}

async function callSynexusApi(config, body) {
    const url = config.url;
    console.log("Synexus final URL:", url);

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
    });

    console.log("Synexus HTTP status:", response.status, response.statusText);

    if (!response.ok) {
        let errorText = "";
        try {
            errorText = await response.text();
        } catch (e) {
            console.warn("Could not read error response text.", e);
        }

        console.error("Synexus HTTP error body:", errorText);
        throw new Error(`HTTP ${response.status} ${response.statusText}. ${errorText}`);
    }

    const data = await response.json();
    console.log("Parsed Synexus response JSON:", data);
    return data;
}

async function applyTaxUpdates(invoiceLines, responseData) {
    console.log("applyTaxUpdates() START");

    if (!responseData || !Array.isArray(responseData.cart)) {
        console.error("Invalid Synexus response. Missing cart array.", responseData);
        throw new Error("Invalid Synexus response: missing cart array.");
    }

    const lineIdList = invoiceLines.map(l => l.invoicedetailid);
    console.log("Line IDs to update:", lineIdList);

    const updates = [];

    for (let i = 0; i < responseData.cart.length && i < lineIdList.length; i++) {
        const apiLine = responseData.cart[i];
        const newTaxValue = Number(apiLine && apiLine.LineTaxAmt ? apiLine.LineTaxAmt : 0);

        const update = {
            lineId: lineIdList[i],
            tax: newTaxValue
        };

        updates.push(update);
    }

    console.log("Prepared updates:", updates);

    for (const update of updates) {
        console.log("Updating invoicedetail:", update.lineId, "with tax:", update.tax);
        await Xrm.WebApi.updateRecord("invoicedetail", update.lineId, { tax: update.tax });
        console.log("Update completed for line:", update.lineId);
    }

    console.log("applyTaxUpdates() END");
}

function getProductIdentifier(line) {
    const formattedName = line["_productid_value@OData.Community.Display.V1.FormattedValue"];
    const resolved = safeTrim(formattedName) || safeTrim(line._productid_value) || "N/A";
    console.log("Resolved product identifier:", resolved);
    return resolved;
}

function getEntityId(formContext) {
    const id = formContext.data && formContext.data.entity && formContext.data.entity.getId
        ? formContext.data.entity.getId()
        : "";

    console.log("getEntityId() =>", id);
    return id || "";
}

function getAttributeValue(formContext, fieldName) {
    try {
        const attr = formContext.getAttribute(fieldName);
        const value = attr ? attr.getValue() : null;
        console.log(`Field [${fieldName}] value:`, value);
        return value;
    } catch (e) {
        console.warn(`Could not read field [${fieldName}]`, e);
        return null;
    }
}

function getLookupValue(formContext, fieldName) {
    try {
        const value = getAttributeValue(formContext, fieldName);
        if (value && value.length > 0) {
            console.log(`Lookup [${fieldName}] first value:`, value[0]);
            return value[0];
        }
        console.warn(`Lookup [${fieldName}] is empty.`);
        return null;
    } catch (e) {
        console.warn(`Could not read lookup field [${fieldName}]`, e);
        return null;
    }
}

function getTextField(formContext, fieldName) {
    try {
        const attr = formContext.getAttribute(fieldName);
        if (!attr) {
            console.warn(`Field [${fieldName}] not found on form.`);
            return "";
        }

        const value = attr.getValue();
        const cleanValue = safeTrim(value);
        console.log(`Text field [${fieldName}] =>`, cleanValue);
        return cleanValue;
    } catch (e) {
        console.warn(`Could not read text field [${fieldName}]`, e);
        return "";
    }
}

function getTextFieldOrFallback(formContext, fieldName, fallbackValue) {
    try {
        const attr = formContext.getAttribute(fieldName);

        if (!attr) {
            console.warn(`Field [${fieldName}] not found on form. Using fallback =>`, fallbackValue);
            return fallbackValue;
        }

        const value = attr.getValue();
        console.log(`Raw text field [${fieldName}] =>`, value);

        if (value === null || value === undefined || String(value).trim() === "") {
            console.warn(`Field [${fieldName}] empty. Using fallback =>`, fallbackValue);
            return fallbackValue;
        }

        const cleanValue = String(value).trim();
        console.log(`Field [${fieldName}] resolved from form =>`, cleanValue);
        return cleanValue;
    } catch (e) {
        console.warn(`Error reading field [${fieldName}]. Using fallback =>`, fallbackValue, e);
        return fallbackValue;
    }
}

function mergeAddressLines(line1, line2, line3) {
    const parts = [safeTrim(line1), safeTrim(line2), safeTrim(line3)].filter(Boolean);
    const merged = parts.join(", ");
    console.log("mergeAddressLines() input:", { line1, line2, line3 });
    console.log("mergeAddressLines() output:", merged);
    return merged;
}

function normalizeApiBaseUrl(url) {
    url = safeTrim(url);
    console.log("normalizeApiBaseUrl() input:", url);

    if (!url) return "";

    const normalized = url.endsWith("/") ? url : url + "/";
    console.log("normalizeApiBaseUrl() output:", normalized);
    return normalized;
}

function wrapGuidForOData(guid) {
    const cleaned = safeTrim(guid).replace(/[{}]/g, "");
    console.log("wrapGuidForOData() input:", guid, "output:", cleaned);
    return cleaned;
}

function safeTrim(value) {
    return value === null || value === undefined ? "" : String(value).trim();
}

async function showDialog(message) {
    try {
        console.log("showDialog() =>", message);
        await Xrm.Navigation.openAlertDialog({ text: message });
    } catch (e) {
        console.warn("Could not show dialog:", e);
    }
}

// =====================================================
// Register PostSave handler on form load
// =====================================================
function registerSynexusPostSave(executionContext) {
    console.log("==================================================");
    console.log("=== registerSynexusPostSave START ===");

    try {
        if (!executionContext) {
            console.error("Execution context not received in registerSynexusPostSave.");
            return;
        }

        const formContext = executionContext.getFormContext();
        console.log("registerSynexusPostSave FormContext:", formContext);

        if (!formContext || !formContext.data || !formContext.data.entity) {
            console.error("Form context or entity not available for PostSave registration.");
            return;
        }

        // Avoid duplicate registrations if form reloads
        try {
            formContext.data.entity.removeOnPostSave(notifyCommittedTransaction);
            console.log("Previous PostSave handler removed (if it existed).");
        } catch (e) {
            console.warn("Could not remove previous PostSave handler.", e);
        }

        formContext.data.entity.addOnPostSave(notifyCommittedTransaction);
        console.log("notifyCommittedTransaction successfully registered on PostSave.");

        console.log("=== registerSynexusPostSave END ===");
        console.log("==================================================");
    } catch (error) {
        console.error("=== registerSynexusPostSave ERROR ===", error);
        console.error("Error message:", error && error.message ? error.message : error);
        console.error("Error stack:", error && error.stack ? error.stack : "No stack");
        console.log("==================================================");
    }
}

// =====================================================
// PostSave handler - notify Synexus that invoice is now committed
// =====================================================
const synexusCommittedSent = {};

async function notifyCommittedTransaction(executionContext) {
    console.log("==================================================");
    console.log("=== Synexus PostSave START ===");

    try {
        if (!executionContext) {
            console.error("Execution context not received.");
            return;
        }

        const formContext = executionContext.getFormContext();
        console.log("PostSave FormContext:", formContext);

        if (!formContext) {
            console.error("FormContext not available.");
            return;
        }

        const invoiceId = getEntityId(formContext);
        console.log("PostSave Invoice ID:", invoiceId);

        if (!invoiceId) {
            console.warn("Invoice ID not found after save. Nothing to notify.");
            return;
        }

        const cleanInvoiceId = invoiceId.replace(/[{}]/g, "");

        if (synexusCommittedSent[cleanInvoiceId]) {
            console.warn("Committed Synexus notification already sent in this form session. Skipping duplicate call.");
            return;
        }

        const postSaveArgs = executionContext.getEventArgs ? executionContext.getEventArgs() : null;
        console.log("PostSave event args:", postSaveArgs);

        try {
            if (postSaveArgs && typeof postSaveArgs.isSaveSuccess === "function") {
                const saveSuccess = postSaveArgs.isSaveSuccess();
                console.log("PostSave save success:", saveSuccess);

                if (!saveSuccess) {
                    console.warn("Save was not successful. Synexus committed notification skipped.");
                    return;
                }
            }
        } catch (e) {
            console.warn("Could not evaluate PostSave success state.", e);
        }

        Xrm.Utility.showProgressIndicator("Sending committed Synexus transaction...");

        console.log("=== Loading environment variables / fallback config ===");
        const config = await getSynexusConfig();
        console.log("Resolved Synexus Config:", {
            url: config.url,
            FunctionId: config.FunctionId ? "[present]" : "[missing]",
            clientCode: config.clientCode ? "[present]" : "[missing]"
        });

       if (!config.url || !config.clientCode) {
            console.error("Missing Synexus configuration.", config);
            Xrm.Utility.closeProgressIndicator();
            await showDialog("Synexus configuration is missing.");
            return;
        }

        console.log("=== Loading invoice lines for committed transaction ===");
        const invoiceLines = await getInvoiceLines(invoiceId);
        console.log("Invoice lines loaded:", invoiceLines);

        if (!invoiceLines.length) {
            console.warn("No invoice lines found.");
            Xrm.Utility.closeProgressIndicator();
            return;
        }

        console.log("=== Building committed request body ===");
        const requestBody = buildCommittedSynexusRequestBody(formContext, config, invoiceId, invoiceLines);
        console.log("Committed Synexus Request Body:", JSON.stringify(requestBody, null, 2));

        console.log("=== Calling Synexus API for committed transaction ===");
        const responseData = await callSynexusApi(config, requestBody);
        console.log("Committed Synexus API Response:", responseData);

        synexusCommittedSent[cleanInvoiceId] = true;

        Xrm.Utility.closeProgressIndicator();

        console.log("=== Synexus PostSave SUCCESS ===");
        console.log("==================================================");
    } catch (error) {
        Xrm.Utility.closeProgressIndicator();
        console.error("=== Synexus PostSave ERROR ===", error);
        console.error("Error message:", error && error.message ? error.message : error);
        console.error("Error stack:", error && error.stack ? error.stack : "No stack");
        console.log("==================================================");
    }
}

function buildCommittedSynexusRequestBody(formContext, config, invoiceId, invoiceLines) {
    console.log("buildCommittedSynexusRequestBody() START");

    const customerLookup = getLookupValue(formContext, "customerid");
    const customerId = customerLookup && customerLookup.id ? customerLookup.id.replace(/[{}]/g, "") : "";
    console.log("Customer ID:", customerId);

    const cart = invoiceLines.map((line, index) => {
        const item = {
            ItemID: getProductIdentifier(line),
            Price: Number(line.priceperunit || 0),
            Quantity: Number(line.quantity || 0),
            LineTaxAmt: Number(line.tax || 0)
        };

        console.log(`Committed cart item ${index + 1}:`, item);
        return item;
    });

    console.log("=== Resolving ShipTo fields from Invoice ===");

    const toAddress1 = getTextFieldOrFallback(formContext, "shipto_line1", FALLBACK_TO_ADDRESS.line1);
    const toAddress2 = getTextFieldOrFallback(formContext, "shipto_line2", FALLBACK_TO_ADDRESS.line2);
    const toAddress3 = getTextFieldOrFallback(formContext, "shipto_line3", FALLBACK_TO_ADDRESS.line3);
    const toCity = getTextFieldOrFallback(formContext, "shipto_city", FALLBACK_TO_ADDRESS.city);
    const toZip = getTextFieldOrFallback(formContext, "shipto_postalcode", FALLBACK_TO_ADDRESS.zip);
    const toState = getTextFieldOrFallback(formContext, "shipto_stateorprovince", FALLBACK_TO_ADDRESS.state);

    console.log("Resolved ShipTo address for committed transaction:", {
        toAddress1,
        toAddress2,
        toAddress3,
        toCity,
        toZip,
        toState
    });

    const finalToAddress1 = mergeAddressLines(toAddress1, toAddress2, toAddress3);
    console.log("Final ToAddress1 after merge:", finalToAddress1);

    const body = {
        facilityNumber: "0",
        testTransaction: false,
        clientID: "VENN",
        entityID: "496",
        customerID: customerId || "0",
        cartID: invoiceId.replace(/[{}]/g, ""),
        deliveredBySeller: true,
        pickup: false,
        Committed: true,

        FromAddress1: FALLBACK_FROM_ADDRESS.line1,
        FromAddress2: FALLBACK_FROM_ADDRESS.line2,
        FromCity: FALLBACK_FROM_ADDRESS.city,
        FromZip: FALLBACK_FROM_ADDRESS.zip,
        FromState: FALLBACK_FROM_ADDRESS.state,

        ToAddress1: finalToAddress1,
        ToAddress2: "",
        ToCity: toCity,
        ToZip: toZip,
        ToState: toState,
        ToCountry: "USA",

        cart: cart
    };

    console.log("Final committed FROM address:", {
        FromAddress1: body.FromAddress1,
        FromAddress2: body.FromAddress2,
        FromCity: body.FromCity,
        FromZip: body.FromZip,
        FromState: body.FromState
    });

    console.log("Final committed TO address:", {
        ToAddress1: body.ToAddress1,
        ToAddress2: body.ToAddress2,
        ToCity: body.ToCity,
        ToZip: body.ToZip,
        ToState: body.ToState,
        ToCountry: body.ToCountry
    });

    console.log("buildCommittedSynexusRequestBody() END");
    return body;
}