// form.js
let isOnline = navigator.onLine;
let realPan = "";
let realAadhaar = "";
let realBankAccount = "";
let isRestoring = false;

window.debouncedSaveDraft = function () {
  console.warn("debouncedSaveDraft called before initialization");
};

function getCandidateFullName() {
  const fn = document.getElementById("firstName")?.value || "";
  const ln = document.getElementById("lastName")?.value || "";
  return `${fn} ${ln}`.trim();
}
/* =========================================================
  GLOBAL HELPERS
========================================================= */
const API_BASE = "https://offlineform.onrender.com";
window.addEventListener("online", () => {
  isOnline = true;
  console.log("Back online");
  syncOfflineSubmissions();
});

window.addEventListener("offline", () => {
  isOnline = false;
  console.log("You are Offline. You can continue filling the form");
});

let lastDraftHash = "";

async function saveDraft(draft) {
  if (!draft?.formData) return;

  const hash = JSON.stringify(draft);
  if (hash === lastDraftHash) return;
  lastDraftHash = hash;

  // Always save locally
  try {
    const parsed = typeof draft.formData === "string"
      ? JSON.parse(draft.formData)
      : draft.formData;
    await saveDraftToDB(parsed);
  } catch {
    console.warn("Invalid formData JSON, skipping local save");
  }

  if (!navigator.onLine) return;

  try {
    await fetch(`${API_BASE}/api/drafts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft)
    });
  } catch {
    console.warn("Server draft save failed");
  }
}

/* ---------- MARITAL STATUS TOGGLE ---------- */
function toggleMaritalFields() {
  const show = maritalStatus?.value === "Married";

  if (marriageDate?.parentElement)
    marriageDate.parentElement.style.display = show ? "block" : "none";

  if (childrenCount?.parentElement)
    childrenCount.parentElement.style.display = show ? "block" : "none";

  if (!show) {
    marriageDate.value = "";
    childrenCount.value = "";
    clearError(marriageDate);
    clearError(childrenCount);
  }
}


function toggleIllnessFields() {
  const prolongedIllness = document.getElementById("illness");
  const illnessName = document.getElementById("illnessName");
  const illnessDuration = document.getElementById("illnessDuration");

  const show = prolongedIllness?.value === "Yes";

  if (illnessName?.parentElement)
    illnessName.parentElement.style.display = show ? "block" : "none";

  if (illnessDuration?.parentElement)
    illnessDuration.parentElement.style.display = show ? "block" : "none";

  if (!show) {
    if (illnessName) illnessName.value = "";
    if (illnessDuration) illnessDuration.value = "";
  }
}

function isVisible(el) {
  return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
}

function collectFormData() {
  const data = {};
  document.querySelectorAll("input, select, textarea").forEach(el => {
    if (!el.name) return;

    if (el.type === "radio") {
      if (el.checked) data[el.name] = el.value;
    } else if (el.type === "checkbox") {
      data[el.name] = el.checked;
    } else {
      data[el.name] = el.value;
    }
  });
  return data;
}

// Consolidated Restore Function
async function restoreDraftState(data) {
  if (!data) return;

  isRestoring = true;

  try {
    // 1️⃣ Restore dynamic rows FIRST
    if (data.fields) {
      restoreFamilyRows(data.fields);
      restoreLanguageRows(data.fields);
    }

    // 2️⃣ Delay actual field population
    setTimeout(() => {
      try {
        if (data.fields) {
          restoreFormData(data.fields);
          restoreMaskedKYC(data.fields);
        }
        // 🔁 Recalculate derived / conditional fields
        recalculateAge();
        toggleIllnessFields();
        toggleMaritalFields();
        toggleExperienceDependentSections();
        validateStep3Languages(true);

        if (typeof data.step === "number") {
          showStep(data.step);
        }
        if (Array.isArray(data.educationRows)) {
          restoreEducationRows(data.educationRows);
        }

      } finally {
        isRestoring = false;
      }
    }, 50); // 🔥 use 50ms not 0

  } catch (err) {
    console.error("Restore failed:", err);
    isRestoring = false;
  }
}

function toggleExperienceDependentSections() {
  const years = parseInt(document.getElementById("expYears")?.value || 0);
  const months = parseInt(document.getElementById("expMonths")?.value || 0);

  const show = years > 0 || months > 0;

  const expSection = document.getElementById("experienceDetails");

  if (expSection) {
    expSection.style.display = show ? "block" : "none";
  }
}

function restoreFamilyRows(fields) {
  const tbody = document.getElementById("familyTableBody");
  if (!tbody || !fields) return;

  // Clear existing rows to ensure exact state match
  tbody.innerHTML = "";

  // Count required rows based on keys like 'family[index][name]'
  let maxIndex = -1;
  Object.keys(fields).forEach(key => {
    const match = key.match(/^family\[(\d+)\]/);
    if (match) {
      maxIndex = Math.max(maxIndex, parseInt(match[1]));
    }
  });

  const requiredCount = maxIndex + 1;

  for (let i = 0; i < requiredCount; i++) {
    addFamilyRow();
  }

  // Update relationship options after restoring rows
  setTimeout(() => {
    updateFamilyRelationshipOptions();
    const tbody = document.getElementById("familyTableBody");
    if (tbody) tbody.querySelectorAll("tr").forEach(bindFamilyRowAutosave);
  }, 0);
}

function restoreLanguageRows(fields) {
  const tbody = document.querySelector("#languageTable tbody");
  if (!tbody || !fields) return;

  // Clear all rows first
  tbody.innerHTML = "";

  let maxIndex = -1;

  Object.keys(fields).forEach(key => {
    const match = key.match(/^languages\[(\d+)\]/);
    if (match) {
      maxIndex = Math.max(maxIndex, parseInt(match[1]));
    }
  });

  if (maxIndex < 0) return;

  for (let i = 0; i <= maxIndex; i++) {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>
        <input type="text" name="languages[${i}][name]">
      </td>
      <td>
        <input type="checkbox" name="languages[${i}][speak]">
      </td>
      <td>
        <input type="checkbox" name="languages[${i}][read]">
      </td>
      <td>
        <input type="checkbox" name="languages[${i}][write]">
      </td>
      <td>
        <input type="radio" name="motherTongue" value="${i}">
      </td>
    `;

    tbody.appendChild(tr);

    // Bind autosave safely
    tr.querySelectorAll("input").forEach(el => {
      el.addEventListener("input", window.debouncedSaveDraft);
      el.addEventListener("change", window.debouncedSaveDraft);
    });
  }
}



function restoreFormData(data) {
  if (!data) return;

  Object.entries(data).forEach(([key, value]) => {
    // PAN & Aadhaar & Bank Account handled separately by restoreMaskedKYC
    if (key === "pan" || key === "aadhaar" || key === "bankAccount") return;

    const field = document.querySelector(`[name="${key}"]`);
    if (field) {
      let target = field;
      if (field.type === "radio") {
        const matching = document.querySelector(`input[name="${key}"][value="${value}"]`);
        if (matching) {
          matching.checked = true;
          target = matching;
        }
      } else if (field.type === "checkbox") {
        field.checked = !!value;
      } else {
        field.value = value || "";
      }
      target.dispatchEvent(new Event("input", { bubbles: true }));
    }
  });

}

function restoreMaskedKYC(data) {
  if (!data) return;

  const panHidden = document.getElementById("pan");
  const panDisplay = document.getElementById("panDisplay");
  const aadhaarHidden = document.getElementById("aadhaar");
  const aadhaarDisplay = document.getElementById("aadhaarDisplay");
  const bankHidden = document.getElementById("bankAccount");
  const bankDisplay = document.getElementById("bankAccountDisplay");

  console.log("🔍 Restoring KYC data:", {
    pan: data.pan,
    aadhaar: data.aadhaar,
    bankAccount: data.bankAccount
  });

  // PAN
  if (data.pan && panHidden && panDisplay) {
    realPan = data.pan;
    panHidden.value = data.pan;

    // Only mask if it's a valid PAN format (10 chars)
    if (data.pan.length === 10) {
      panDisplay.value = data.pan.slice(0, 2) + "****" + data.pan.slice(6);
      console.log("✅ PAN restored and masked");
    } else {
      panDisplay.value = data.pan;
      console.log("⚠️ PAN restored but not masked (invalid length)");
    }
  }

  // Aadhaar
  if (data.aadhaar && aadhaarHidden && aadhaarDisplay) {
    realAadhaar = data.aadhaar;
    aadhaarHidden.value = data.aadhaar;

    // Only mask if it's a valid Aadhaar format (12 digits)
    if (data.aadhaar.length === 12) {
      aadhaarDisplay.value = "XXXXXXXX" + data.aadhaar.slice(-4);
      console.log("✅ Aadhaar restored and masked");
    } else {
      aadhaarDisplay.value = data.aadhaar;
      console.log("⚠️ Aadhaar restored but not masked (invalid length)");
    }
  }

  // Bank Account
  if (data.bankAccount && bankHidden && bankDisplay) {
    realBankAccount = data.bankAccount;
    bankHidden.value = data.bankAccount;

    // Only mask if it's at least 8 digits
    if (data.bankAccount.length >= 8) {
      bankDisplay.value = "XXXXXX" + data.bankAccount.slice(-4);
      console.log("✅ Bank Account restored and masked");
    } else {
      bankDisplay.value = data.bankAccount;
      console.log("⚠️ Bank Account restored but not masked (invalid length)");
    }
  }
}


function recalculateAge() {
  const dob = document.getElementById("dob")?.value;
  const ageEl = document.getElementById("age");

  if (!dob || !ageEl) return;

  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  ageEl.value = age;
}

function isAlphaOnly(value) {
  return /^[A-Za-z\s.]+$/.test(value.trim());
}

function isYear(value) {
  const y = Number(value);
  return /^\d{4}$/.test(value) && y >= 1900 && y <= 2099;
}

async function syncOfflineSubmissions() {
  if (!navigator.onLine) return;

  const queue = await getOfflineData();
  if (!queue.length) return;

  for (const item of queue) {
    try {
      const res = await fetch(
        `${API_BASE}/api/drafts?mobile=${encodeURIComponent(item.mobile)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(item)
        }
      );
      if (!res.ok) throw new Error("Upload failed");
    } catch {
      console.warn("Will retry later");
      return; // stop but keep offline data
    }
  }

  // ✅ only clear after ALL succeed
  await clearOfflineData();
  console.log("All offline submissions synced");
}

const isFutureDate = d => d && new Date(d) > new Date();
const minLen = (v, l) => v && v.trim().length >= l;
// const onlyNumbers = v => /^\d+$/.test(v);
const val = el => el?.value?.trim() || "";

const isValidPersonName = v =>
  typeof v === "string" &&
  v.trim().length >= 2 &&
  /^[A-Za-z .'-]+$/.test(v.trim());


const isValidBankOrBranch = v =>
  typeof v === "string" &&
  v.trim().length >= 3 &&
  /^[A-Za-z .'-]+$/.test(v.trim());

const heightPattern = /^[1-8]'([0-9]|1[01])$/;
const panPattern = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const aadhaarPlain = /^\d{12}$/;


window.addFamilyRow = () => {
  const tbody = document.getElementById("familyTableBody");

  if (!tbody) return;

  const index = tbody.children.length;
  const tr = document.createElement("tr");
  tr.innerHTML = `
      <td>${index + 1}</td>
      <td>
        <select name="family[${index}][relationship]">
          <option value="">Select</option>
          <option>Father</option>
          <option>Mother</option>
          <option>Brother</option>
          <option>Sister</option>
          <option>Spouse</option>
        </select>
      </td>
      <td><input type="text" name="family[${index}][name]"></td>
      <td><input type="date" name="family[${index}][dob]"></td>
      <td>
        <select name="family[${index}][dependent]">
          <option value="">Select</option>
          <option>Yes</option>
          <option>No</option>
        </select>
      </td>
      <td><input type="text" name="family[${index}][occupation]"></td>
      <td><input type="number" name="family[${index}][income]" min="0"></td>
    `;
  tbody.appendChild(tr);

  // ✅ Limit income to 6 digits (CORRECT PLACE)
  const incomeInput = tr.querySelector("input[name*='income']");
  incomeInput.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 6) v = v.slice(0, 6);
    e.target.value = v;
  });

  // ✅ THIS WAS MISSING
  const rel = tr.querySelector("select[name*='relationship']");
  rel.addEventListener("change", () => {
    syncFamilyRow(tr);
    updateFamilyRelationshipOptions(); // ✅ ADD THIS
  });
  bindFamilyRowAutosave(tr);
};

function bindFamilyRowAutosave(row) {
  row.querySelectorAll("input, select").forEach(el => {
    el.addEventListener("input", window.debouncedSaveDraft);
    el.addEventListener("change", window.debouncedSaveDraft);
  });
}

function syncFamilyRow(row) {
  const rel = row.querySelector("select[name*='relationship']");
  const nameInput = row.querySelector("input[name*='name']");
  const dobInputRow = row.querySelector("input[name*='dob']");

  if (!rel || !nameInput || !dobInputRow) return;

  const fatherName = document.getElementById("fatherName")?.value?.trim() || "";
  const motherName = document.getElementById("motherName")?.value?.trim() || "";

  // 🔴 ALWAYS reset first
  nameInput.readOnly = false;

  if (rel.value === "Father") {
    nameInput.value = fatherName || "";
    nameInput.readOnly = true;
  } else if (rel.value === "Mother") {
    nameInput.value = motherName || "";
    nameInput.readOnly = true;
  } else {
    if (
      (fatherName && nameInput.value === fatherName) ||
      (motherName && nameInput.value === motherName)
    ) {
      nameInput.value = "";
    }
  }
  dobInputRow.readOnly = false;
}

function updateFamilyRelationshipOptions() {
  const rows = document.querySelectorAll("#familyTableBody tr");

  let fatherUsed = false;
  let motherUsed = false;

  // First pass → detect used relations
  rows.forEach(row => {
    const rel = row.querySelector("select[name*='relationship']");
    if (!rel) return;
    if (rel.value === "Father") fatherUsed = true;
    if (rel.value === "Mother") motherUsed = true;
  });

  // Second pass → disable options accordingly
  rows.forEach(row => {
    const rel = row.querySelector("select[name*='relationship']");
    if (!rel) return;

    rel.querySelectorAll("option").forEach(opt => {
      if (opt.value === "Father") {
        opt.disabled = fatherUsed && rel.value !== "Father";
      }
      if (opt.value === "Mother") {
        opt.disabled = motherUsed && rel.value !== "Mother";
      }
    });
  });
}

function setupMediclaimRequiredLogic() {
  const yes = document.getElementById("mediclaimYes");
  const no = document.getElementById("mediclaimNo");
  const details = document.getElementById("mediclaimDetails");
  const hidden = document.getElementById("mediclaimConsent");

  if (!yes || !no || !details || !hidden) return;

  // all inputs inside mediclaim section
  const inputs = details.querySelectorAll("input, select");

  function toggleRequired(isYes) {
    details.style.display = isYes ? "block" : "none";
    hidden.value = isYes ? "Yes" : "No";

    inputs.forEach(el => {
      // do NOT force readonly auto‑filled fields
      if (!el.hasAttribute("readonly")) {
        el.required = isYes;
      }
    });
  }

  yes.addEventListener("change", () => toggleRequired(true));
  no.addEventListener("change", () => toggleRequired(false));

  // restore state (offline / back navigation)
  if (hidden.value === "Yes") {
    yes.checked = true;
    toggleRequired(true);
  } else if (hidden.value === "No") {
    no.checked = true;
    toggleRequired(false);
  } else {
    details.style.display = "none";
  }
}

function fillMediclaimEmployeeDetails() {
  const map = {
    "firstName lastName": () =>
      `${firstName.value || ""} ${lastName.value || ""}`.trim(),
    dob: () => dob.value,
    employeeId: () => employeeId.value,
    today: () => new Date().toLocaleDateString()
  };
  document.querySelectorAll("[data-bind]").forEach(el => {
    const key = el.dataset.bind;
    if (map[key]) el.textContent = map[key]();
  });
}
// run when entering step‑6
function showStep(index) {
  steps.forEach((step, i) => step.classList.toggle("active", i === index));

  // Safety check for stepperSteps
  if (window.stepperSteps) {
    stepperSteps.forEach((circle, i) =>
      circle.classList.toggle("active", i <= index)
    );
  }

  if (index === 5) { // Step‑6
    fillMediclaimEmployeeDetails();
    fillMediclaimFamilyDetails(); // ✅ ADD THIS
  }
}

function initFamilyRow(row) {
  const rel = row.querySelector("select[name*='relationship']");
  if (!rel) return;

  rel.addEventListener("change", () => {
    syncFamilyRow(row);
    updateFamilyRelationshipOptions();
  });

  // initial state sync
  syncFamilyRow(row);
  updateFamilyRelationshipOptions();
}

function ensureVisibleError(step) {
  const err = step.querySelector(".error");
  if (!err) {
    console.warn("Validation failed but no field marked error");
    shakeCurrentStep();
  }
}

document.addEventListener("change", e => {
  if (e.target.closest("#familyTableBody")) {
    fillMediclaimFamilyDetails();
  }
});

function fillMediclaimFamilyDetails() {
  const tbody = document.getElementById("mediclaimFamilyBody");
  if (!tbody) return;

  tbody.innerHTML = "";
  let sno = 1;

  const rows = document.querySelectorAll("#familyTableBody tr");

  rows.forEach(row => {
    const relation = row.querySelector("select[name*='relationship']")?.value || "";
    const name = row.querySelector("input[name*='name']")?.value || "";
    let dob = row.querySelector("input[name*='dob']")?.value || "";

    if (dob) {
      const [year, month, day] = dob.split("-");
      dob = `${day}/${month}/${year}`;
    }

    if (!relation || !name) return;

    let gender = "";

    switch (relation) {
      case "Father":
      case "Brother":
        gender = "Male";
        break;

      case "Mother":
      case "Sister":
        gender = "Female";
        break;

      case "Spouse": {
        const candidateGender =
          document.querySelector("input[name='gender']:checked")?.value || "";
        if (candidateGender === "Male") gender = "Female";
        else if (candidateGender === "Female") gender = "Male";
        break;
      }
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${sno++}</td>
      <td>${relation}</td>
      <td>${gender}</td>
      <td>${name}</td>
      <td>${dob}</td>
    `;
    tbody.appendChild(tr);
  });
}


document.addEventListener("change", e => {
  if (!e.target.matches("select[name*='relationship']")) return;

  if (e.target.value === "Spouse") {
    const spouses = [...document.querySelectorAll(
      "select[name*='relationship']"
    )].filter(s => s.value === "Spouse");

    if (spouses.length > 1) {
      alert("Only one spouse is allowed");
      e.target.value = "";
    }
  }
});

function allowOnlyYear(input) {
  input.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "").slice(0, 4);

    if (v.length === 4) {
      const year = Number(v);
      if (year < 1900) v = "1900";
      if (year > 2099) v = "2099";
    }

    e.target.value = v;
  });
}

function allowOnlyAlphabets(input) {
  input.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/[^A-Za-z .]/g, "");
  });
}

function isSkippable(el) {
  return (
    !el ||
    el.disabled ||
    el.readOnly ||
    el.offsetParent === null ||
    el.id === "pan" ||
    el.id === "aadhaar" ||
    el.id === "bankAccount"
  );
}

let serverDraft = null;

async function loadDraft(mobile) {
  try {
    const response = await fetch(
      `${API_BASE}/api/drafts?mobile=${encodeURIComponent(mobile)}`
    );

    if (response.status === 204) {
      return null; // no draft found
    }

    if (!response.ok) return null;

    serverDraft = await response.json(); // ✅ DEFINED HERE
    return serverDraft;
  } catch {
    return null;
  }
}

function clearError(el) {
  if (!el) return;
  el.classList.remove("error");
  const next = el.nextElementSibling;
  if (next && next.classList.contains("error-text")) next.remove();
}

function showError(el, msg, silent = false) {
  if (silent || !el) return;

  clearError(el); // ✅ prevents stacking

  el.classList.add("error");

  const s = document.createElement("small");
  s.className = "error-text";
  s.innerText = msg;
  el.after(s);
}
  // Global validateStep3Languages function with silent parameter support
  function validateStep3Languages(silent = false) {
    let ok = true;

    const rows = document.querySelectorAll("#languageTable tbody tr");
    const motherTongues = document.querySelectorAll(
      'input[name="motherTongue"]:checked'
    );

    // ✅ Exactly ONE mother tongue required
    if (motherTongues.length !== 1) {
      if (!silent) {
        alert("Select exactly one Mother Tongue");
      }
      ok = false;
    }

    rows.forEach(row => {
      const nameInput = row.querySelector("input[name*='[name]']");
      const speak = row.querySelector("input[name*='[speak]']");
      const read = row.querySelector("input[name*='[read]']");
      const write = row.querySelector("input[name*='[write]']");

      const name = nameInput?.value.trim();
      const hasSkill = speak?.checked || read?.checked || write?.checked;

      // 🚫 Skip completely empty row
      if (!name && !hasSkill) {
        return;
      }

      // ❌ Name missing
      if (!name) {
        showError(nameInput, "Language name required", silent);
        ok = false;
      }

      // ❌ Skill missing
      if (!hasSkill) {
        showError(nameInput, "Select at least one skill", silent);
        ok = false;
      }
    });

    return ok;
  }

/* =========================================================
  MAIN
========================================================= */
let steps = [];

document.addEventListener("DOMContentLoaded", () => {
  steps = document.querySelectorAll(".form-step");

  const loggedInMobile =
    sessionStorage.getItem("loggedInMobile") ||
    localStorage.getItem("loggedInMobile");

  if (!loggedInMobile) {
    window.location.href = "login.html";
    return;
  }

  (async function restoreDraftFlow() {
    try {
      await openDB();
      // setupEducationTable();
      // 1️⃣ Try server first
      serverDraft = await loadDraft(loggedInMobile);

      if (serverDraft?.formData) {
        const parsed = typeof serverDraft.formData === "string"
          ? JSON.parse(serverDraft.formData)
          : serverDraft.formData;

        await restoreDraftState(parsed);
        return;
      }

      // 2️⃣ Fallback to IndexedDB
      const localDraft = await loadDraftFromDB();
      if (localDraft) {
        await restoreDraftState(localDraft);
      }
    } catch (err) {
      console.error("Draft restore failed:", err);
    }
  })();

  document.getElementById("addEducationBtn")
    ?.addEventListener("click", () => {
      addEducationRow({});
      debouncedSaveDraft();
    });

  let currentStep = 0;
  let isSubmitting = false;

  window._debugCurrentStep = () => currentStep;

  const formStatus = sessionStorage.getItem("formStatus");


function addEducationRow(data = {}) {
  const tbody = document.querySelector(".graduation-wrapper table tbody");
  if (!tbody) return;

  const tr = document.createElement("tr");
  tr.innerHTML = `
    <td><input type="text" name="grad_college[]" value="${data.college || ""}"></td>
    <td><input type="text" name="grad_board[]" value="${data.board || ""}"></td>
    <td><input type="text" name="grad_degree[]" value="${data.degree || ""}"></td>
    <td><input type="text" name="grad_stream[]" value="${data.stream || ""}"></td>
    <td><input type="number" name="grad_joining[]" value="${data.joining || ""}"></td>
    <td><input type="number" name="grad_leaving[]" value="${data.leaving || ""}"></td>
    <td><input type="number" name="grad_aggregate[]" value="${data.aggregate || ""}"></td>
    <td>
      <button type="button" class="deleteRow">Delete</button>
    </td>
  `;

  tr.querySelector(".deleteRow").addEventListener("click", function () {
    tr.remove();
    debouncedSaveDraft();
  });

  tbody.appendChild(tr);
}



  function getEducationRowsData() {
    const rows = [];

    // First fixed graduation row
    const firstGrad = document.querySelector(".graduation-wrapper table tbody tr");
    if (firstGrad) {
      const inputs = firstGrad.querySelectorAll("input");
      rows.push({
        college: inputs[0].value,
        board: inputs[1].value,
        degree: inputs[2].value,
        stream: inputs[3].value,
        joining: inputs[4].value,
        leaving: inputs[5].value,
        aggregate: inputs[6].value
      });
    }

    // Extra graduation rows
    document.querySelectorAll("#extraGraduations table tbody tr").forEach(tr => {
      const inputs = tr.querySelectorAll("input");
      rows.push({
        college: inputs[0].value,
        board: inputs[1].value,
        degree: inputs[2].value,
        stream: inputs[3].value,
        joining: inputs[4].value,
        leaving: inputs[5].value,
        aggregate: inputs[6].value
      });
    });

    return rows;
  }
  // Old saveEducationRows (localStorage) removed

  window.restoreEducationRows = function (saved = []) {
    if (!Array.isArray(saved) || saved.length === 0) return;

    // Restore first row
    const firstGrad = document.querySelector(".graduation-wrapper table tbody tr");
    if (firstGrad && saved[0]) {
      const inputs = firstGrad.querySelectorAll("input");
      inputs[0].value = saved[0].college || "";
      inputs[1].value = saved[0].board || "";
      inputs[2].value = saved[0].degree || "";
      inputs[3].value = saved[0].stream || "";
      inputs[4].value = saved[0].joining || "";
      inputs[5].value = saved[0].leaving || "";
      inputs[6].value = saved[0].aggregate || "";
    }

    // Restore extra rows
    for (let i = 1; i < saved.length; i++) {
      addEducationRow(saved[i]);
    }
  };


  // function setupEducationTable() {
  //   const tbody = document.getElementById("educationTableBody");
  //   if (!tbody) return;

  //   tbody.innerHTML = "";

  //   addEducationRow(null, false); 
  //   addEducationRow(null, false); 
  //   addEducationRow(null, false);

  //   const addBtn = document.getElementById("addEducationBtn");
  //   addBtn?.addEventListener("click", () => {
  //     addEducationRow(null, true);
  //     debouncedSaveDraft();
  //   });
  // }

  // function removeRow(btn) {
  //   btn.closest("tr").remove();
  //   debouncedSaveDraft();
  // }

  document.addEventListener("input", e => {
    if (
      e.target.closest(".graduation-wrapper") ||
      e.target.closest("#extraGraduations")
    ) {
      debouncedSaveDraft();
    }
  });

  ["loanAmount", "loanBalance", "loanSalary"].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("input", function () {
      this.value = this.value.replace(/\D/g, "").slice(0, 8);
    });
  });


  function stopAutosave() {
    // No-op: Interval removed in favor of event-based saving
  }

  if (loggedInMobile) {
    const mobile1 = document.getElementById("mobile1");
    const mobile2 = document.getElementById("mobile2");

    if (mobile1) {
      mobile1.value = loggedInMobile;
      mobile1.readOnly = true;
    }

    if (mobile2) {
      mobile2.value = loggedInMobile;
      mobile2.readOnly = true;
    }
  }

  // restoreDraft(); // Removed (using async loadDraftFromDB on window.load)

  const mainForm = document.getElementById("candidateForm");
  if (!mainForm) {
    console.warn("mainForm not found in DOM");
    return;
  }

  if (formStatus === "SUBMITTED") {
    document.body.innerHTML = `
    <div class="already-filled">
      <h2>You already filled the form</h2>
      <button id="newFormBtn">Fill another form</button>
    </div>`;

    document.getElementById("newFormBtn").onclick = async () => {
      await fetch("/api/new-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: sessionStorage.getItem("loggedInMobile")
        })
      });

      sessionStorage.setItem("formStatus", "NEW");
      sessionStorage.removeItem("serverDraft");
      clearDraft();
      window.location.reload();
    };
    return; // ⛔ Stop form JS execution
  }

  setupMediclaimRequiredLogic();

  document
    .querySelectorAll("#familyTableBody tr")
    .forEach(initFamilyRow);



  const nextBtn = document.getElementById("nextBtn");
  const prevBtn = document.getElementById("prevBtn");
  const submitBtn = document.getElementById("submitBtn");

  let draftTimer;
  function debouncedSaveDraft() {
    if (isSubmitting) return;
    if (isRestoring || !loggedInMobile) return;
    if (typeof saveDraft !== "function") return;

    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const data = collectFormData();
      const educationalParams = getEducationRowsData();

      saveDraft({
        mobile: loggedInMobile,
        formData: JSON.stringify({
          step: currentStep,
          fields: {
            ...data,
            // Explicitly prefer real values for masked fields
            pan: realPan || data.pan || "",
            aadhaar: realAadhaar || data.aadhaar || "",
            bankAccount: realBankAccount || data.bankAccount || ""
          },
          educationRows: educationalParams
        })
      });

    }, 500);
  }
  window.debouncedSaveDraft = debouncedSaveDraft;




  function syncAllFamilyRows() {
    document.querySelectorAll("#familyTableBody tr").forEach(syncFamilyRow);
  }

  document.getElementById("fatherName")
    ?.addEventListener("input", syncAllFamilyRows);

  document.getElementById("motherName")
    ?.addEventListener("input", syncAllFamilyRows);

  document.addEventListener("input", e => {
    const el = e.target;

    if (
      el.placeholder === "Joining Year" ||
      el.placeholder === "Leaving Year"
    ) {
      const yearPattern = /^\d{4}$/;
      if (yearPattern.test(el.value)) {
        clearError(el); // ✅ remove error + text
      }
    }
  });

  document.querySelectorAll("input[name='gender']").forEach(radio => {
    radio.addEventListener("change", () => {
      const group = document.querySelector(".gender-group");
      clearError(group);
    });
  });

  const languageTableBody = document.querySelector("#languageTable tbody");
  const addLanguageBtn = document.getElementById("addLanguageBtn");

  addLanguageBtn?.addEventListener("click", () => {
    const index = languageTableBody.querySelectorAll("tr").length;

    const tr = document.createElement("tr");
    tr.innerHTML = `
    <td>
      <input type="text" name="languages[${index}][name]" placeholder="Language">
    </td>
    <td>
      <input type="checkbox" name="languages[${index}][speak]">
    </td>
    <td>
      <input type="checkbox" name="languages[${index}][read]">
    </td>
    <td>
      <input type="checkbox" name="languages[${index}][write]">
    </td>
    <td>
      <input type="radio" name="motherTongue" value="${index}">
    </td>
  `;

    languageTableBody.appendChild(tr);

    // Bind autosave for new row
    tr.querySelectorAll("input").forEach(el => {
      el.addEventListener("input", debouncedSaveDraft);
      el.addEventListener("change", debouncedSaveDraft);
    });

  });

  // YEARS
  // document.getElementById("expYears")?.addEventListener("input", toggleExperienceDependentSections);

  // MONTHS
  const monthsEl = document.getElementById("expMonths");
  monthsEl?.addEventListener("input", e => {
    let v = +e.target.value || 0;
    if (v > 11) v = 11;
    if (v < 0) v = 0;
    e.target.value = v;
    toggleExperienceDependentSections();
  });
  // toggleExperienceDependentSections();

  ["input", "change"].forEach(evt => {
    document
      .querySelector("#candidateForm")
      ?.addEventListener(evt, debouncedSaveDraft);
  });

  const newFormBtn = document.getElementById("newFormBtn");
  if (newFormBtn) {
    newFormBtn.onclick = async () => {
      await fetch("/api/new-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: sessionStorage.getItem("loggedInMobile")
        })
      });

      sessionStorage.setItem("formStatus", "NEW");
      sessionStorage.removeItem("serverDraft");
      window.location.reload();
    };
  }

  function allowOnlyDigits(input, maxLength) {
    input.addEventListener("input", e => {
      let v = e.target.value.replace(/\D/g, ""); // ❌ remove non-digits
      if (v.length > maxLength) v = v.slice(0, maxLength);
      e.target.value = v;
    });
  }

  // UAN – exactly 12 digits
  const uanInput = document.getElementById("uan");
  if (uanInput) {
    allowOnlyDigits(uanInput, 12);
  }

  // Account Number – max 18 digits
  const accountInput = document.getElementById("bankAccount");
  if (accountInput) {
    allowOnlyDigits(accountInput, 18);
  }

  const interviewDropdown = document.getElementById("interviewedBefore");
  const interviewDetails = document.getElementById("interviewDetails");

  if (interviewDropdown && interviewDetails) {

    interviewDropdown.addEventListener("change", function () {

      if (this.value === "yes") {
        interviewDetails.style.display = "block";
      } else {
        interviewDetails.style.display = "none";

        // Optional: clear values when hidden
        interviewDetails.querySelectorAll("input").forEach(input => {
          input.value = "";
        });
      }

    });
    interviewDropdown.dispatchEvent(new Event("change"));
  }

  /* ================= ERROR HELPERS ================= */
  function clearStepErrors(step) {
    step?.querySelectorAll(".error-text")?.forEach(e => e.remove());
    step?.querySelectorAll(".error")?.forEach(e => e.classList.remove("error"));
    step?.querySelector(".step-error")?.remove();
  }


  function showStepError(step, msg, silent = false) {
    if (silent) return;
    const d = document.createElement("div");
    d.className = "step-error";
    d.innerText = msg;
    step?.prepend(d);
  }

  function focusFirstError(step) {
    const el = step?.querySelector(".error");
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
    el?.focus();
  }

  function shakeCurrentStep() {
    const step = steps[currentStep];
    if (!step) return;

    step.classList.remove("shake"); // reset if already applied
    void step.offsetWidth;          // force reflow
    step.classList.add("shake");
  }

  function showSummaryError(step, msg) {
    step.querySelector(".step-error")?.remove();

    const div = document.createElement("div");
    div.className = "step-error";
    div.innerText = msg;

    const title = step.querySelector(".section-title");

    if (title && title.parentNode) {
      title.parentNode.insertBefore(div, title);
    } else {
      step.prepend(div);
    }
  }
  document.getElementById("monthlyTotal")?.addEventListener("keydown", e => {
    e.preventDefault();
  });
  document.getElementById("annualTotal")?.addEventListener("keydown", e => {
    e.preventDefault();
  });

  // ================= STEP‑3 CONDITIONAL TEXTAREAS =================
  const step3 = steps[2];
  step3
    .querySelectorAll("textarea.conditional-details")
    .forEach(textarea => {
      const select = textarea.previousElementSibling;

      function syncTextareaVisibility() {
        if (select.value === "Yes") {
          textarea.style.display = "block";
        } else {
          textarea.style.display = "none";
          textarea.value = "";
          clearError(textarea);
        }
      }

      select.addEventListener("change", syncTextareaVisibility);
      syncTextareaVisibility();
    });

  document.querySelectorAll(".mobile-input").forEach(input => {
    input.addEventListener("input", e => {
      // Digits only
      let v = e.target.value.replace(/\D/g, "");

      // Limit to exactly 10 digits
      if (v.length > 10) v = v.slice(0, 10);

      e.target.value = v;

      // Auto-clear error when valid
      if (v.length === 10) {
        clearError(e.target);
      }
    });
  });

  const isBlank = v => !v || !v.trim();
  const isAlpha = v => typeof v === "string" && /^[A-Za-z ]+$/.test(v.trim());
  const isDigits = v => /^\d+$/.test(v);
  const inRange = (v, min, max) => Number(v) >= min && Number(v) <= max;

  const ifscPattern = /^[A-Z]{4}0[A-Z0-9]{6}$/;


  /* =========================================================
    PAN + AADHAAR (CORRECTED)
  ========================================================= */
  const panInput = document.getElementById("panDisplay");
  const panHidden = document.getElementById("pan");
  const aadhaarInput = document.getElementById("aadhaarDisplay");
  const aadhaarHidden = document.getElementById("aadhaar");

  // ===== PAN =====
  panInput?.addEventListener("input", e => {
    if (isRestoring) return; // ✅ Fixed flag name

    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (v.length > 10) v = v.slice(0, 10);

    if (panPattern.test(v)) {
      realPan = v;
      panHidden.value = v; // Sync hidden
      e.target.value = v.slice(0, 2) + "****" + v.slice(6);
      clearError(panInput);
    } else {
      realPan = "";
      panHidden.value = "";
      e.target.value = v;
    }
  });

  panInput?.addEventListener("focus", () => {
    if (realPan) panInput.value = realPan;
  });

  panInput?.addEventListener("blur", () => {
    if (realPan && panPattern.test(realPan)) {
      panInput.value = realPan.slice(0, 2) + "****" + realPan.slice(6);
    }
  });


  // ===== AADHAAR =====
  aadhaarInput?.addEventListener("input", e => {
    if (isRestoring) return; // ✅ Fixed flag name

    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 12) v = v.slice(0, 12);

    if (aadhaarPlain.test(v)) {
      realAadhaar = v;
      aadhaarHidden.value = v; // Sync hidden
      e.target.value = "XXXXXXXX" + v.slice(8);
      clearError(aadhaarInput);
    } else {
      realAadhaar = "";
      aadhaarHidden.value = "";
      e.target.value = v;
    }
  });

  aadhaarInput?.addEventListener("focus", () => {
    if (realAadhaar) aadhaarInput.value = realAadhaar;
  });

  aadhaarInput?.addEventListener("blur", () => {
    if (realAadhaar && aadhaarPlain.test(realAadhaar)) {
      aadhaarInput.value = "XXXXXXXX" + realAadhaar.slice(8);
    }
  });


  /* =========================================================
   BANK ACCOUNT (FIXED MASKING LOGIC)
 ========================================================= */

  const bankAccInput = document.getElementById("bankAccountDisplay");
  const bankAccHidden = document.getElementById("bankAccount");

  // While typing → allow up to 18 digits, show real value
  bankAccInput?.addEventListener("input", e => {
    if (isRestoring) return;

    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 18) v = v.slice(0, 18);

    realBankAccount = v;
    bankAccHidden.value = v;

    // Show real value while typing (NOT masked)
    e.target.value = v;
  });

  // On focus → show real number
  bankAccInput?.addEventListener("focus", () => {
    if (realBankAccount) {
      bankAccInput.value = realBankAccount;
    }
  });

  // On blur → mask if valid length (8-18 digits)
  bankAccInput?.addEventListener("blur", () => {
    if (realBankAccount.length >= 8) {
      bankAccInput.value = "XXXXXX" + realBankAccount.slice(-4);
    }
  });

  /* =========================================================
    STEP 1 – PERSONAL
  ========================================================= */
  const dobInput = document.getElementById("dob");
  const ageInput = document.getElementById("age");
  const maritalStatus = document.getElementById("maritalStatus");
  const marriageDate = document.getElementById("marriageDate");
  const childrenCount = document.getElementById("childrenCount");
  const prolongedIllness = document.getElementById("illness");
  const illnessName = document.getElementById("illnessName");
  const illnessDuration = document.getElementById("illnessDuration");
  const savedEmail =
    localStorage.getItem("email") || sessionStorage.getItem("email");

  if (savedEmail) {
    document.getElementById("email").value = savedEmail;
  }

  document.getElementById("permanentAddress")?.addEventListener("input", e => {
    if (e.target.value.length > 25) {
      e.target.value = e.target.value.slice(0, 25);
    }
  });

  /* ---------- DOB → AGE ---------- */
  dobInput?.addEventListener("change", () => {
    if (!dobInput.value) {
      ageInput.value = "";
      return;
    }
    const dob = new Date(dobInput.value);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    if (today < new Date(today.getFullYear(), dob.getMonth(), dob.getDate())) {
      age--;
    }
    ageInput.value = age >= 0 ? age : "";
  });

  maritalStatus?.addEventListener("change", toggleMaritalFields);
  // toggleMaritalFields();

  prolongedIllness?.addEventListener("change", toggleIllnessFields);
  // toggleIllnessFields();

  function syncMaskedKYC() {
    if (
      !realPan &&
      panInput.value &&
      panPattern.test(panInput.value)
    ) {
      realPan = panInput.value;
    }

    if (
      !realAadhaar &&
      aadhaarInput.value &&
      /^\d{12}$/.test(aadhaarInput.value)
    ) {
      realAadhaar = aadhaarInput.value;
    }
  }

  function validateKYC(silent = false) {
    syncMaskedKYC();
    let ok = true;

    clearError(panInput);
    clearError(aadhaarInput);

    // ✅ PAN
    if (!realPan) {
      showError(panInput, "PAN is required", silent);
      ok = false;
    } else if (!panPattern.test(realPan)) {
      showError(panInput, "Invalid PAN format", silent);
      ok = false;
    }

    // ✅ Aadhaar
    if (!realAadhaar) {
      showError(aadhaarInput, "Aadhaar is required", silent);
      ok = false;
    } else if (!aadhaarPlain.test(realAadhaar)) {
      showError(aadhaarInput, "Aadhaar must be 12 digits", silent);
      ok = false;
    }

    return ok;
  }


  function validateStep1(silent = false) {
    const step = steps[0];
    if (!silent) clearStepErrors(step);
    let ok = true;

    const fn = step.querySelector("#firstName");
    const ln = step.querySelector("#lastName");
    // const pan = step.querySelector("#pan");
    // const aadhaar = step.querySelector("#aadhaar");
    const dob = step.querySelector("#dob");
    const age = step.querySelector("#age");

    // ----- Religion / Nationality / Parents (REQUIRED) -----
    const religion = step.querySelector("#religion");
    const nationality = step.querySelector("#nationality");
    const father = step.querySelector("#fatherName");
    const mother = step.querySelector("#motherName");

    if (!religion?.value?.trim()) {
      showError(religion, "Religion is required", silent);
      ok = false;
    }

    if (!nationality?.value?.trim()) {
      showError(nationality, "Nationality is required", silent);
      ok = false;
    }

    if (!isValidPersonName(father?.value)) {
      showError(father, "Valid father's name required", silent);
      ok = false;
    }

    if (!isValidPersonName(mother?.value)) {
      showError(mother, "Valid mother's name required", silent);
      ok = false;
    }

    if (!dob?.value || isFutureDate(dob.value)) {
      showError(dob, "Invalid DOB", silent);
      ok = false;
    }

    if (+age?.value < 18) {
      showError(age, "Age must be ≥ 18", silent);
      ok = false;
    }

    if (!minLen(fn?.value, 2) || !isAlpha(fn?.value)) {
      showError(fn, "Invalid first name", silent);
      ok = false;
    }

    if (!minLen(ln?.value, 1) || !isAlpha(ln?.value)) {
      showError(ln, "Invalid last name", silent);
      ok = false;
    }

    if (!maritalStatus?.value) {
      showError(maritalStatus, "Marital status is required", silent);
      ok = false;
    }

    if (maritalStatus?.value === "Married") {
      if (!marriageDate?.value) {
        showError(marriageDate, "Marriage date required", silent);
        ok = false;
      }
      if (childrenCount?.value === "" || +childrenCount.value < 0) {
        showError(childrenCount, "Enter valid children count", silent);
        ok = false;
      }
    }

    if (!prolongedIllness?.value) {
      showError(prolongedIllness, "Please select illness status", silent);
      ok = false;
    }

    if (!validateKYC(silent)) ok = false;

    if (prolongedIllness?.value === "Yes") {
      if (!illnessName?.value.trim()) {
        showError(illnessName, "Illness name required", silent);
        ok = false;
      }
      if (!illnessDuration?.value.trim()) {
        showError(illnessDuration, "Duration required", silent);
        ok = false;
      }

      if (!prolongedIllness.value) {
        showError(prolongedIllness, "Select illness status", silent);
      }

    }

    const disability = step.querySelector("#disability");
    if (!disability?.value) {
      showError(disability, "Please select physical disability status", silent);
      ok = false;
    }

    ["mobile1", "mobile2"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (!/^\d{10}$/.test(el.value)) {
        showError(el, "Enter 10 digit mobile number", silent);
        ok = false;
      }
    });

    // ----- Gender -----
    const genderGroup = step.querySelector(".gender-group");
    const genderChecked = step.querySelector("input[name='gender']:checked");

    if (!genderChecked) {
      clearError(genderGroup);
      showError(genderGroup, "Required", silent);

      ok = false;
    }
    // ----- Place of Birth  -----
    const pob = step.querySelector("#placeOfBirth");

    if (isBlank(pob.value)) {
      showError(pob, "Place of birth is required", silent);
      ok = false;
    } else if (!isAlpha(pob.value)) {
      showError(pob, "Alphabets only", silent);
      ok = false;
    }

    const state = step.querySelector("#state");
    if (!state?.value) {
      showError(state, "State is required", silent);
      ok = false;
    }
    // ----- Marriage Date ≤ Today -----
    if (maritalStatus.value === "Married" && marriageDate.value) {
      if (isFutureDate(marriageDate.value)) {
        showError(marriageDate, "Marriage date cannot be future", silent);
        ok = false;
      }
    }

    // ----- Address Length -----
    ["permanentAddress"].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      if (
        isBlank(el.value) ||
        el.value.trim().length < 10 ||
        el.value.trim().length > 25
      ) {
        showError(el, "Address must be 10–25 characters", silent);
        ok = false;
      }
    });

    // ----- Height / Weight -----
    const feet = document.getElementById("heightFeet");
    const weight = document.getElementById("weight");


    if (isBlank(feet.value)) {
      showError(feet, "Height is required", silent);
      ok = false;
    } else if (!heightPattern.test(feet.value.trim())) {
      showError(
        feet,
        "Enter height in feet'inches format (e.g. 5'8, 6'2)",
        silent
      );
      ok = false;
    }

    if (isBlank(weight.value)) {
      showError(weight, "Weight is required", silent);
      ok = false;
    } else if (!inRange(weight.value, 30, 300)) {
      showError(weight, "Weight must be 30–300 kg", silent);
      ok = false;
    }

    if (!realBankAccount || realBankAccount.length < 8 || realBankAccount.length > 18) {
      showError(bankAccInput, "Required Account number(8-18 digits)", silent);
      ok = false;
    }



    // ----- Bank Name -----
    const bankName = step.querySelector("#bankName");

    if (!isValidBankOrBranch(bankName?.value)) {
      showError(bankName, "Enter valid bank name", silent);
      ok = false;
    }

    // ----- Branch Name -----
    const branch = step.querySelector("#branch");

    if (!isValidBankOrBranch(branch?.value)) {
      showError(branch, "Enter valid branch name", silent);
      ok = false;
    }

    const ifsc = document.getElementById("ifsc");
    if (!ifscPattern.test(ifsc.value)) {
      showError(ifsc, "Invalid IFSC Code", silent);
      ok = false;
    }

    // step.querySelectorAll("input, textarea").forEach(el => {
    //   if (isSkippable(el)) return;

    //   if (!el.value.trim()) {
    //     showError(el, "Required", silent);
    //     ok = false;
    //   }
    // });

    // ----- PAN -----
    const email = step.querySelector("#email");

    if (isBlank(email.value)) {
      showError(email, "Email is required", silent);
      ok = false;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      showError(email, "Enter a valid email address", silent);
      ok = false;
    }

    if (isRestoring) return true;

    if (!ok && !silent) {
      if (step.querySelector(".error")) {
        showSummaryError(
          step,
          "Please correct the highlighted errors before continuing"
        );
        focusFirstError(step);
      }
    }
    return ok;
  }


  /* =========================================================
    STEP 2 – FAMILY
  ========================================================= */

  function validateStep2(silent = false) {
    const step = steps[1];
    if (!silent) clearStepErrors(step);
    let ok = true;

    const tbody = document.getElementById("familyTableBody");
    const rows = tbody?.querySelectorAll("tr") || [];

    if (!rows.length) {
      showStepError(step, "Add at least one family member", silent);
      return false;
    }

    const seen = new Set();

    rows.forEach(row => {

      const rel = row.querySelector("select[name*='relationship']");
      const name = row.querySelector("input[name*='name']");
      const dob = row.querySelector("input[name*='dob']");
      const dep = row.querySelector("select[name*='dependent']");
      const occupation = row.querySelector("input[name*='occupation']");
      const income = row.querySelector("input[name*='income']");

      if (!rel?.value) {
        showError(rel, "Relationship required", silent);
        ok = false;
      }

      if (!isAlpha(name?.value)) {
        showError(name, "Valid name required", silent);
        ok = false;
      }

      if (!dob?.value || isFutureDate(dob.value)) {
        showError(dob, "Invalid DOB", silent);
        ok = false;
      }

      // Occupation required
      if (!occupation || occupation.value.trim().length === 0) {
        showError(occupation, "Occupation is required", silent);
        ok = false;
      }


      if (!income || income.value === "") {
        showError(income, "Income is required", silent);
        ok = false;
      }

      if (!dep?.value) {
        showError(dep, "Dependent status required", silent);
        ok = false;
      }

      // if (income.value && income.value.length > 6) {
      //   showError(income, "Maximum 6 digits allowed", silent);
      //   ok = false;
      // }

      if (income && Number(income.value) < 0) {
        showError(income, "Income cannot be negative", silent);
        ok = false;
      }

      // Only one Father / Mother / Spouse
      if (["Father", "Mother", "Spouse"].includes(rel?.value)) {
        if (seen.has(rel.value)) {
          showError(rel, `Only one ${rel.value} allowed`, silent);
          ok = false;
        }
        seen.add(rel.value);
      }

      // ✅ Parent age validation
      if (
        (rel?.value === "Father" || rel?.value === "Mother") &&
        dob?.value &&
        dobInput?.value
      ) {
        const parentDOB = new Date(dob.value);
        const candidateDOB = new Date(dobInput.value);

        if (parentDOB >= candidateDOB) {
          showError(dob, "Parent must be older than candidate", silent);
          ok = false;
        }
      }

    });

    if (!ok && !silent) {
      const hasFieldErrors = step.querySelector(".error");
      if (hasFieldErrors) {
        showSummaryError(step, "Please correct the highlighted errors before continuing");
        focusFirstError(step);
      }
    }
    return ok;
  }

  /* =========================================================
    STEP 3 – EDUCATION
  ========================================================= */
  // function addLanguage() {
  //   const container = document.getElementById("extraLanguages");
  //   const div = document.createElement("div");
  //   div.className = "language-item";
  //   div.innerHTML = `
  //   <input type="text" placeholder="Enter language" class="language-input" required>
  //   <button type="button" onclick="this.parentElement.remove()">Remove</button>
  // `;
  //   container.appendChild(div);
  // }

  // function restoreLanguages(savedLanguages) {
  //   const tbody = document.querySelector("#languageTable tbody");
  //   tbody.innerHTML = "";
  //   addLanguageRow("English", false);
  //   addLanguageRow("Hindi", false);
  //   savedLanguages.forEach(lang => {
  //     addLanguageRow(lang.name, true, lang);
  //   });
  // }

  function validateStep3(silent = false) {
    const step = steps[2];
    if (!step) return true; // defensive check

    if (!silent) clearStepErrors(step);

    let ok = true;
    const rows = document.querySelectorAll(
      ".graduation-wrapper table tbody tr, #extraGraduations table tbody tr"
    );

    if (!rows.length) {
      showStepError(step, "Add at least one education detail", silent);
      return false;
    }

    const degreeSet = new Set();
    const currentYear = new Date().getFullYear();
    const dobValue = document.getElementById("dob")?.value;
    const dobYear = dobValue ? new Date(dobValue).getFullYear() : null;
    const member = document.getElementById("member");
    const honors = document.getElementById("honors");


   if (!validateStep3Languages(false)) {
  ok = false;

  if (!silent) {
    showSummaryError(step, "Please correct language details");
    focusFirstError(step);
  }
}

    let graduationLeavingYear = null;

    const gradRow = rows[0];
    if (gradRow) {
      const gradLeave = gradRow.querySelector("input[name='grad_leaving[]']");
      if (gradLeave && isYear(gradLeave.value)) {
        graduationLeavingYear = +gradLeave.value;
      }
    }

    rows.forEach((row, index) => {
      const college = row.querySelector("input[name='grad_college[]']");
      const board = row.querySelector("input[name='grad_board[]']");
      const degree = row.querySelector("input[name='grad_degree[]']");
      const stream = row.querySelector("input[name='grad_stream[]']");
      const joinYear = row.querySelector("input[name='grad_joining[]']");
      const leaveYear = row.querySelector("input[name='grad_leaving[]']");
      const percent = row.querySelector("input[name='grad_aggregate[]']");


      /* ---------- Prevent Completely Blank Row ---------- */
      const allEmpty =
        !college.value.trim() &&
        !board.value.trim() &&
        !degree.value.trim() &&
        !stream.value.trim() &&
        !joinYear.value.trim() &&
        !leaveYear.value.trim() &&
        !percent.value.trim();

      if (allEmpty) {
        showError(college, "Fill education details or remove row", silent);
        ok = false;
        return;
      }

      /* ---------- Required Fields ---------- */
      // ✅ College Name
      if (!college.value || !/^[A-Za-z0-9 .,'&()-]+$/.test(college.value)) {
        showError(college, "Required", silent);
        ok = false;
      }

      // ✅ Board
      if (!board.value || !isAlphaOnly(board.value)) {
        showError(board, "Required", silent);
        ok = false;
      }

      // ✅ Degree
      if (!degree.value || !isAlphaOnly(degree.value)) {
        showError(degree, "Required", silent);
        ok = false;
      }

      // ✅ Stream (required only for Graduation - index 0)
      // ✅ Stream (required for all rows)
      // Stream required for all rows EXCEPT schooling (index 2)
      // Stream required only if degree is NOT "Schooling"
      if (degree.value.trim().toLowerCase() !== "schooling") {
        if (!stream.value.trim()) {
          showError(stream, "Required", silent);
          ok = false;
        } else if (!isAlphaOnly(stream.value)) {
          showError(stream, "Alphabets only", silent);
          ok = false;
        }
      }

      /* ---------- Year Sequencing with Graduation Awareness ---------- */
      if (isYear(joinYear.value) && isYear(leaveYear.value)) {

        if (+leaveYear.value <= +joinYear.value) {
          showError(leaveYear, "Leaving year must be after joining year", silent);
          ok = false;
        }

        // Graduation row (index 0)
        if (index === 0) {
          if (+leaveYear.value - +joinYear.value > 6) {
            showError(leaveYear, "Graduation duration cannot exceed 6 years", silent);
            ok = false;
          }
        }

        // Pre-graduation rows (1 & 2)
        if ((index === 1 || index === 2) && graduationLeavingYear !== null) {
          if (+leaveYear.value >= graduationLeavingYear) {
            showError(leaveYear, "Must be completed before Graduation", silent);
            ok = false;
          }
        }

        // Post-graduation rows (3+)
        if (index >= 3 && graduationLeavingYear !== null) {
          if (+joinYear.value <= graduationLeavingYear) {
            showError(joinYear, "Post-graduation must start after Graduation", silent);
            ok = false;
          }
        }
      }

      /* ---------- Year Validation ---------- */
      if (!isYear(joinYear.value)) {
        showError(joinYear, "Enter valid 4-digit joining year", silent);
        ok = false;
      } else if (+joinYear.value > currentYear) {
        showError(joinYear, "Joining year cannot be in the future", silent);
        ok = false;
      } else if (dobYear !== null && +joinYear.value < dobYear + 5) {
        showError(joinYear, "Joining year is not realistic", silent);
        ok = false;
      }

      if (!isYear(leaveYear.value)) {
        showError(leaveYear, "Enter valid 4-digit leaving year", silent);
        ok = false;
      } else if (+leaveYear.value > currentYear) {
        showError(leaveYear, "Leaving year cannot be in the future", silent);
        ok = false;
      }

      if (
        isYear(joinYear.value) &&
        isYear(leaveYear.value) &&
        +leaveYear.value > +joinYear.value
      ) {
        if (+leaveYear.value - +joinYear.value > 10) {
          showError(leaveYear, "Education duration seems invalid (>10 yrs)", silent);
          ok = false;
        }
      }

      /* ---------- Percentage ---------- */
      const percentValue = Number(percent.value);

      if (percent.value === "" || isNaN(percentValue)) {
        showError(percent, "Required", silent);
        ok = false;
      } else if (percentValue < 35 || percentValue > 100) {
        showError(percent, "Percentage must be between 35 and 100", silent);
        ok = false;
      }

      /* ---------- Prevent Duplicate Degrees ---------- */
      if (degree.value.trim()) {
        const degreeKey =
          degree.value.trim().toLowerCase() + "_" +
          stream.value.trim().toLowerCase();

        if (degreeSet.has(degreeKey)) {
          showError(degree, "Duplicate degree entry", silent);
          ok = false;
        } else {
          degreeSet.add(degreeKey);
        }
      }
    });

    if (!member || !member.value) {
      showError(member, "Please select an option", silent);
      ok = false;
    }

    if (!honors || !honors.value) {
      showError(honors, "Please select an option", silent);
      ok = false;
    }

    const literary = document.getElementById("activityLiterary");
    const sports = document.getElementById("activitySports");
    const hobbies = document.getElementById("activityHobbies");
    const extraError = document.getElementById("extraCurricularError");

    if (
      !literary?.value.trim() &&
      !sports?.value.trim() &&
      !hobbies?.value.trim()
    ) {
      if (extraError) extraError.style.display = "block";

      const target = literary || sports || hobbies;
      if (target) {
        showError(target, "Enter at least one activity", silent);
      }

      ok = false;
    }
    else {
      if (extraError) extraError.style.display = "none";
    }

    const motherTongueSelected = document.querySelector(
      "#languageTable input[name='motherTongue']:checked"
    );
    // if (!motherTongueSelected) {
    //   const radioGroup = document.querySelector("#languageTable");
    //   showError(radioGroup, "Select mother tongue", silent);
    //   ok = false;
    // }


    const strengths = document.getElementById("strengths");
    const weaknesses = document.getElementById("Weaknesses");
    const values = document.getElementById("Values");

    if (!strengths || isBlank(strengths.value)) {
      showError(strengths, "Strengths are required", silent);
      ok = false;
    }

    if (!weaknesses || isBlank(weaknesses.value)) {
      showError(weaknesses, "Weaknesses are required", silent);
      ok = false;
    }

    if (!values || isBlank(values.value)) {
      showError(values, "Values are required", silent);
      ok = false;
    }


    // Get all selects in Step-3
    step.querySelectorAll("select + textarea").forEach(textarea => {
      const select = textarea.previousElementSibling;

      if (select.value.toLowerCase() === "yes" && isBlank(textarea.value)) {
        showError(
          textarea,
          "Details are required when 'Yes' is selected",
          silent
        );
        ok = false;
      }
    });

    if (!ok && !silent) {
      if (step.querySelector(".error")) {
        showSummaryError(
          step,
          "Please correct the highlighted errors before continuing"
        );
        focusFirstError(step);
      } else {
        console.warn("Step‑3 invalid but no field marked error");
        shakeCurrentStep();
      }
    }

    return ok;
  }


  /* =========================================================
    STEP 4 – EXPERIENCE
  ========================================================= */
  function toggleExperienceDependentSections() {
    const years = Number(document.getElementById("expYears")?.value || 0);
    const months = Number(document.getElementById("expMonths")?.value || 0);
    const hasExperience = years > 0 || months > 0;

    // Toggle UAN
    const uanContainer = document.getElementById("uanContainer");
    if (uanContainer) {
      uanContainer.style.display = hasExperience ? "block" : "none";
      if (!hasExperience) {
        const uanInput = document.getElementById("uan");
        if (uanInput) {
          uanInput.value = "";
          clearError(uanInput);
        }
      }
    }

    // Toggle Employment History & Assignments
    const empHistory = document.getElementById("employmentHistory");
    const assignments = document.getElementById("assignmentsHandled");

    if (empHistory) empHistory.style.display = hasExperience ? "block" : "none";
    if (assignments) assignments.style.display = hasExperience ? "block" : "none";
  }

  // Bind events
  document.getElementById("expYears")?.addEventListener("input", toggleExperienceDependentSections);
  document.getElementById("expMonths")?.addEventListener("input", toggleExperienceDependentSections);
  // Call once on load/init logic (handled in restoreDraftState or similar, but good to ensure)

  /* =========================================================
    STEP 4 – EXPERIENCE
  ========================================================= */
  function validateStep4(silent = false) {
    const step = steps[3];
    if (!silent) clearStepErrors(step);

    let ok = true;

    const yearsEl = step.querySelector("#expYears");
    const monthsEl = step.querySelector("#expMonths");

    const years = Number(yearsEl.value);
    const months = Number(monthsEl.value);

    /* ================= TOTAL EXPERIENCE (REQUIRED) ================= */

    if (yearsEl.value.trim() === "" || years < 0) {
      showError(yearsEl, "Experience years is required", silent);
      ok = false;
    }

    if (monthsEl.value.trim() === "" || months < 0 || months > 11) {
      showError(monthsEl, "Experience months is required (0–11)", silent);
      ok = false;
    }

    const hasExperience = years > 0 || months > 0;

    /* ================= EXPERIENCE DATE VALIDATION ================= */
    const fromDateEl = step.querySelector("#expFrom");
    const toDateEl = step.querySelector("#expTo");

    if (hasExperience && fromDateEl && toDateEl) {

      if (!fromDateEl.value) {
        showError(fromDateEl, "From date is required", silent);
        ok = false;
      }

      if (!toDateEl.value) {
        showError(toDateEl, "To date is required", silent);
        ok = false;
      }

      if (fromDateEl.value && toDateEl.value) {
        const fromDate = new Date(fromDateEl.value);
        const toDate = new Date(toDateEl.value);

        if (toDate <= fromDate) {
          showError(toDateEl, "To Date must be greater than From Date", silent);
          ok = false;
        }
      }
    }

    /* ================= UAN (REQUIRED IF EXPERIENCED) ================= */
    const uan = document.getElementById("uan");
    if (hasExperience && uan) {
      if (!/^\d{12}$/.test(uan.value)) {
        showError(uan, "UAN must be exactly 12 digits", silent);
        ok = false;
      }
    }

    if (hasExperience) {

      /* ================= EMPLOYMENT HISTORY ================= */
      step
        .querySelectorAll("#employmentHistory input, #employmentHistory textarea")
        .forEach(el => {
          if (isSkippable(el)) return;

          if (!el.value.trim()) {
            showError(el, "This field is required", silent);
            ok = false;
          }
        });


      /* ================= ASSIGNMENTS HANDLED ================= */
      step
        .querySelectorAll("#assignmentsHandled input, #assignmentsHandled textarea")
        .forEach(el => {
          if (isSkippable(el)) return;

          if (!el.value.trim()) {
            showError(el, "This field is required", silent);
            ok = false;
          }
        });

    }
    if (!ok && !silent) {
      if (hasExperience) {
        showSummaryError(
          step,
          "Please fill all the fields"
        );
      } else {
        showSummaryError(
          step,
          "Please enter valid Total Experience details"
        );
      }
      focusFirstError(step);
    }
    return ok;
  }

  /* =========================================================
  STEP 5
  ========================================================= */
  const step5 = steps[4];

  const loanAvailed = document.getElementById("loanAvailed");
  const loanFields = document.getElementById("loanFields");

  const loanPurpose = document.getElementById("loanPurpose");
  const loanAmount = document.getElementById("loanAmount");
  const loanBalance = document.getElementById("loanBalance");
  const loanSalary = document.getElementById("loanSalary");


  function toggleLoanFields() {
    const show = loanAvailed?.value === "Yes";

    if (loanFields) loanFields.style.display = show ? "grid" : "none";

    if (!show) {
      [loanPurpose, loanAmount, loanBalance, loanSalary].forEach(el => {
        if (el) {
          el.value = "";
          clearError(el);
        }
      });
    }
  }

  function autoCalculateSalary() {
    if (!step5) return;

    const rows = step5.querySelectorAll(".family-table tbody tr");
    let a = 0, b = 0, c = 0;

    rows.forEach(row => {
      const nums = row.querySelectorAll("input[type='number']");
      if (nums[0]?.value) a += +nums[0].value;
      if (nums[1]?.value) b += +nums[1].value;
      if (nums[2]?.value) c += +nums[2].value;
    });

    const totalA = document.getElementById("totalA");
    const totalB = document.getElementById("totalB");
    const totalC = document.getElementById("totalC");
    const monthly = document.getElementById("monthlyTotal");
    const annual = document.getElementById("annualTotal");

    if (totalA) totalA.value = a;
    if (totalB) totalB.value = b;
    if (totalC) totalC.value = c;
    if (monthly) monthly.value = a + b + c;
    if (annual) annual.value = (a + b + c) * 12;
  }


  // ================= EVENT LISTENERS =================

  // Loan toggle
  loanAvailed?.addEventListener("change", toggleLoanFields);
  toggleLoanFields(); // initial UI sync

  // Salary auto calculation
  step5
    ?.querySelectorAll(".family-table input[type='number']")
    .forEach(i => {
      i.addEventListener("input", e => {
        if (+e.target.value < 0) e.target.value = 0;
        autoCalculateSalary();
      });
    });

  // ================= STEP 5 – VALIDATION =================
  function validateStep5(silent = false) {
    const step = steps[4];
    let ok = true;

    if (!silent) clearStepErrors(step);

    /* ===== Interview Conditional Validation ===== */
    const interviewDropdown = step.querySelector("#interviewedBefore");
    const interviewDate = step.querySelector("#interviewDate");
    const interviewPlace = step.querySelector("#interviewPlace");
    const interviewerName = step.querySelector("#interviewerName");
    const interviewPost = step.querySelector("#interviewPost");

    if (!interviewDropdown?.value) {
      showError(interviewDropdown, "Please select an option", silent);
      ok = false;
    }

    if (interviewDropdown?.value === "yes") {

      if (!interviewDate?.value) {
        showError(interviewDate, "Interview date is required", silent);
        ok = false;
      }

      if (!interviewPlace?.value.trim()) {
        showError(interviewPlace, "Place is required", silent);
        ok = false;
      }

      if (!interviewerName?.value.trim()) {
        showError(interviewerName, "Interviewer name is required", silent);
        ok = false;
      }

      if (!interviewPost?.value.trim()) {
        showError(interviewPost, "Post is required", silent);
        ok = false;
      }
    }

    const years = Number(document.getElementById("expYears")?.value || 0);
    const months = Number(document.getElementById("expMonths")?.value || 0);
    const hasExperience = years > 0 || months > 0;

    /* ===== ALWAYS REQUIRED ===== */
    const declaration = step.querySelector("#declaration");
    const declDate = step.querySelector("#declDate");
    const declPlace = step.querySelector("#declPlace");

    if (!declaration?.checked) {
      showError(declaration, "Declaration is required", silent);
      ok = false;
    }

    if (!declDate?.value) {
      showError(declDate, "Date required", silent);
      ok = false;
    }

    if (!declPlace?.value?.trim()) {
      showError(declPlace, "Place required", silent);
      ok = false;
    }

    /* ===== LOAN AVAILED (MANDATORY SELECTION) ===== */
    if (!loanAvailed?.value) {
      showError(loanAvailed, "Please select Loan Availed (Yes / No)", silent);
      ok = false;
    }

    /* ===== IF YES → LOAN DETAILS REQUIRED ===== */
    if (loanAvailed?.value === "Yes") {
      loanFields && (loanFields.style.display = "grid");

      if (!loanPurpose?.value.trim()) {
        showError(loanPurpose, "Loan purpose is required", silent);
        ok = false;
      }

      if (!(+loanAmount?.value > 0)) {
        showError(loanAmount, "Enter valid loan amount", silent);
        ok = false;
      }

      if (
        loanBalance?.value === "" ||
        +loanBalance.value < 0 ||
        +loanBalance.value > +loanAmount.value
      ) {
        showError(
          loanBalance,
          "Balance must be between 0 and Loan Amount",
          silent
        );
        ok = false;
      }

      if (!(+loanSalary?.value > 0)) {
        showError(loanSalary, "Enter salary amount", silent);
        ok = false;
      }
    }


    /* ================= EXPERIENCE DEPENDENT ================= */
    if (hasExperience) {

      // ✅ Ensure sections visible
      const salarySection = document.getElementById("salarySection");
      const referenceSection = document.getElementById("referenceSection");
      const otherSection = document.getElementById("otherParticulars");

      if (salarySection) salarySection.style.display = "block";
      if (referenceSection) referenceSection.style.display = "block";
      if (otherSection) otherSection.style.display = "block";


      /* ================= PRESENT SALARY (REQUIRED) ================= */
      step.querySelectorAll("#salarySection input").forEach(el => {

        if (isSkippable(el)) return;

        // Skip "Others" fields
        if (el.id === "monthlyOthers" || el.id === "statutoryOthers") {
          return;
        }

        if (!el.value.trim()) {
          showError(el, "This field is required", silent);
          ok = false;
        }
      });



      /* ================= OTHER PARTICULARS (REQUIRED) ================= */
      otherSection
        ?.querySelectorAll("input, select, textarea")
        .forEach(el => {
          if (el.offsetParent === null) return;
          if (isSkippable(el)) return;

          if (!el.value.trim()) {
            showError(el, "Required", silent);
            ok = false;
          }
        });

      /* ================= REFERENCES  ================= */
      const refTable = step5.querySelector(".family-table");
      if (refTable) refTable.style.display = "table";

      const refs = refTable?.querySelectorAll("tbody tr") || [];
      let validRefs = 0;

      refs.forEach(row => {
        const inputs = row.querySelectorAll("input");
        const filled = [...inputs].some(i => !isBlank(i.value));

        if (filled) {
          validRefs++;
          inputs.forEach(i => {
            if (isBlank(i.value)) {
              showError(i, "Required", silent);
              ok = false;
            }
          });
        }
      });

      if (validRefs === 0 && refs.length > 0) {
        refs[0]
          .querySelectorAll("input")
          .forEach(i => showError(i, "Required", silent));

        showStepError(step5, "At least one complete reference is required", silent);
        ok = false;
      }
    }
    /* ================= LOAN (ONLY IF YES) ================= */
    if (loanAvailed?.value === "Yes" && loanFields) {
      loanFields && (loanFields.style.display = "grid");

      if (!loanPurpose?.value.trim()) {
        showError(loanPurpose, "Loan purpose required", silent);
        ok = false;
      }

      if (!(+loanAmount.value > 0)) {
        showError(loanAmount, "Enter valid loan amount", silent);
        ok = false;
      }

      if (!(+loanBalance.value >= 0 && +loanBalance.value <= +loanAmount.value)) {
        showError(
          loanBalance,
          "Balance must be ≥ 0 and ≤ Loan Amount",
          silent
        );
        ok = false;
      }

      if (!(+loanSalary.value > 0)) {
        showError(loanSalary, "Enter Salary", silent);
        ok = false;
      }
    }

    /* ================= SUMMARY ================= */
    if (!ok && !silent) {
      showSummaryError(
        step5,
        "Please correct the highlighted errors before continuing"
      );
      focusFirstError(step5);
    }

    return ok;
  }
  ////////////////////////////////////////
  /*-----------------------Step-6--------------------------- */
  ////////////////////////////////////////
  function validateStep6(silent = false) {
    const step = steps[5];

    if (!mediclaimConsent.value) {
      showStepError(step, "Please select Mediclaim consent", silent);
      return false;
    }
    return true;
  }

  function populateMediclaimStep(data) {

    // ===== Header / simple bindings =====
    document.querySelectorAll("[data-bind]").forEach(el => {
      const key = el.dataset.bind;

      if (key === "today") {
        el.textContent = new Date().toLocaleDateString("en-IN");
      } else if (key === "firstName lastName") {
        el.textContent = `${data.firstName || ""} ${data.lastName || ""}`;
      } else if (data[key]) {
        el.textContent = data[key];
      }
    });

    // ===== Family table =====
    const tbody = document.getElementById("mediclaimFamilyBody");
    if (!tbody) return;

    tbody.innerHTML = "";
    let i = 1;

    const familyRows = Object.keys(data)
      .filter(k => k.startsWith("family["))
      .reduce((rows, key) => {
        const idx = key.match(/\[(\d+)\]/)?.[1];
        if (!rows[idx]) rows[idx] = {};
        rows[idx][key.split("][").pop().replace("]", "")] = data[key];
        return rows;
      }, {});

    Object.values(familyRows).forEach(row => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
      <td class="center">${i++}</td>
      <td>${row.relationship || ""}</td>
      <td>${row.gender || ""}</td>
      <td>${row.name || ""}</td>
      <td>${row.dob || ""}</td>
    `;
      tbody.appendChild(tr);
    });
  }
  const mediclaimYes = document.getElementById("mediclaimYes");
  const mediclaimNo = document.getElementById("mediclaimNo");
  const mediclaimDetails = document.getElementById("mediclaimDetails");
  const mediclaimConsent = document.getElementById("mediclaimConsent");

  function updateMediclaimVisibility() {
    if (!mediclaimYes || !mediclaimNo || !mediclaimDetails) return;

    if (mediclaimYes.checked) {
      mediclaimDetails.style.display = "block";
      mediclaimConsent.value = "Yes";
    } else if (mediclaimNo.checked) {
      mediclaimDetails.style.display = "none";
      mediclaimConsent.value = "No";
    } else {
      mediclaimDetails.style.display = "none";
      mediclaimConsent.value = "";
    }
  }

  if (mediclaimYes && mediclaimNo && mediclaimDetails) {
    mediclaimYes.addEventListener("change", updateMediclaimVisibility);
    mediclaimNo.addEventListener("change", updateMediclaimVisibility);
    updateMediclaimVisibility();
  }


  /* 🔹 SIDEBAR / STEPPER CLICK SUPPORT */
  const validators = [
    validateStep1,
    validateStep2,
    validateStep3,
    validateStep4,
    validateStep5,
    validateStep6
  ];

  function updateUI() {
    /* ===== FORM STEPS ===== */
    steps.forEach((step, i) => {
      step.classList.toggle("active", i === currentStep);
    });

    /* ===== SIDEBAR ===== */
    document.querySelectorAll(".step-menu li").forEach((li, i) => {
      li.classList.toggle("active", i === currentStep);
      li.classList.toggle("completed", i < currentStep);
    });

    /* ===== STEPPER ===== */
    document.querySelectorAll(".stepper-step").forEach((circle, i) => {
      circle.classList.toggle("active", i === currentStep);
      circle.classList.toggle("completed", i < currentStep);
    });

    /* ===== BUTTONS ===== */
    prevBtn.style.display = currentStep === 0 ? "none" : "inline-block";
    nextBtn.style.display =
      currentStep === steps.length - 1 ? "none" : "inline-block";
    submitBtn.style.display =
      currentStep === steps.length - 1 ? "inline-block" : "none";

    if (steps[currentStep]?.classList.contains("step-circular")) {
      populateMediclaimStep(collectFormData());
    }

  }

  /* ===== SIDEBAR CLICK ===== */
  window.goToStep = index => {
    if (index > currentStep && !validators[currentStep](false)) return;

    currentStep = index;
    updateUI();
    updateNextVisualState();
  };

  /* ===== NEXT BUTTON ===== */

  nextBtn.onclick = () => {
    const isValid = validators[currentStep](false);

    if (!isValid) {
      shakeCurrentStep();
      return;
    }

    debouncedSaveDraft();
    currentStep++;
    updateUI();
  };

  /* ===== PREVIOUS BUTTON ===== */
  prevBtn.onclick = () => {
    debouncedSaveDraft();
    currentStep--;
    updateUI();
    updateNextVisualState();
  };

  /* ===== VISUAL STATE ONLY (NEVER DISABLE) ===== */

  function updateNextVisualState() {
    nextBtn.classList.remove("disabled"); // ✅ visual-only, never block logic
  }


  /* ✅ Clear field error immediately when user corrects it */
  document.addEventListener("input", e => {
    const el = e.target;
    if (!el.classList.contains("error")) return;

    el.classList.remove("error");

    const next = el.nextElementSibling;
    if (next && next.classList.contains("error-text")) {
      next.remove();
    }

    updateNextVisualState();
  });

  /* ===== INITIAL RENDER ===== */


  /* ================= SUBMIT ================= */
  document.getElementById("candidateForm").onsubmit = async e => {
    e.preventDefault();
    isSubmitting = true;
    debouncedSaveDraft(); // ✅ Final save before submit logic
    for (let i = 0; i < steps.length; i++) {
      currentStep = i;
      updateUI();
      if (!validators[i](false)) return;
    }

    const payload = collectFormDataForSubmit(); // your form → JSON function
    await submitFormOnlineOrOffline(payload);
  };


  ///////////////---------collectFormData-------////////////,.......................................
  function collectFormDataForSubmit() {
    const form = document.getElementById("candidateForm"); const data = {};

    form.querySelectorAll("input, select, textarea").forEach(el => {
      if (!el.name) return;
      const key = el.name;

      // ✅ Skip masked inputs
      if (key === "pan" || key === "aadhaar") return;

      if (el.type === "checkbox") {
        data[key] = el.checked;
      } else if (el.type === "radio") {
        if (el.checked) data[key] = el.value;
      } else {
        data[key] = el.value;
      }
    });

    // ✅ Always inject real values
    data.pan = realPan || "";
    data.aadhaar = realAadhaar || "";
    data.bankAccount = realBankAccount || "";

    return data;
  }

  async function submitFormOnlineOrOffline(payload) {
    // 🚨 Backend not ready yet
    if (!navigator.onLine) {
      await saveOffline(payload);
      alert("Offline: submission saved");
      return;
    }

    try {
      // const res = await fetch("/api/submit", {\\\\\\\\\\\\\\\\\\\\\>>>>>>>>>>>><<<<<<<<<<<<<>/..........
      const res = await fetch(`${API_BASE}/api/candidates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("API not available");

      // ✅ SUCCESS (future)
      await clearDraft();
      alert("Form submitted successfully");

    } catch (err) {
      console.warn("Submit failed, saving offline", err);

      // ✅ FALLBACK
      await saveOffline(payload);
      alert("Saved offline. Will sync when back online.");
    }
  }

  (async () => {
    if (formStatus === "NEW") {
      sessionStorage.removeItem("serverDraft");
      await clearDraft(); // clear IndexedDB draft
    }

    updateUI();

    requestAnimationFrame(() => {
      if (typeof dobInput !== 'undefined' && dobInput?.value) {
        dobInput.dispatchEvent(new Event("change"));
      }
    });
  })();

  /* ================= ONLINE SYNC ================= */
  window.addEventListener("online", async () => {
    console.log("Back online – sync triggered");
    const pending = await loadOfflineSubmissions(); // your IndexedDB helper
    if (!pending?.length) return;

    for (const payload of pending) {
      try {
        const res = await fetch(`${API_BASE}/api/candidates`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        if (res.ok) {
          await removeOfflineSubmission(payload.id);
        }
      } catch (e) {
        console.warn("Sync failed for one entry", e);
      }
    }
  });
  updateUI();
  updateNextVisualState();
});