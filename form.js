// form.js
let isOnline = navigator.onLine;

function getCandidateFullName() {
  const fn = document.getElementById("firstName")?.value || "";
  const ln = document.getElementById("lastName")?.value || "";
  return `${fn} ${ln}`.trim();
}
/* =========================================================
  GLOBAL HELPERS
========================================================= */
window.addEventListener("online", () => {
  isOnline = true;
  console.log("Back online");
  syncOfflineSubmissions();
});

window.addEventListener("offline", () => {
  isOnline = false;
  console.log("You are Offline. You can continue filling the form");
});

// window.load listener removed - IIFE handles initialization

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

  // 1. Restore Dynamic Family Rows
  if (data.fields) {
      restoreFamilyRows(data.fields);
  }

  // 2. Restore Education Rows
  if (data.educationRows) {
      restoreEducationRows(data.educationRows);
  }

  // 3. Fill Form Data
  if (data.fields) {
      restoreFormData(data.fields);
      restoreMaskedKYC(data.fields);
  }

  // 4. Update UI States
  recalculateAge();
  toggleIllnessFields();
  toggleMaritalFields();
  toggleExperienceDependentSections();
  
  isRestoring = false;
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
}

function restoreFormData(data) {
  if (!data) return;

  document.querySelectorAll("input, select, textarea").forEach(el => {
    if (!el.name || !(el.name in data)) return;

    // PAN & Aadhaar & Bank Account handled separately
    if (el.name === "pan" || el.name === "aadhaar" || el.id === "panDisplay" || el.id === "aadhaarDisplay" || el.id === "bankAccountDisplay") return;

    if (el.type === "radio") {
      el.checked = el.value === data[el.name];
    } else if (el.type === "checkbox") {
      el.checked = !!data[el.name];
    } else {
      el.value = data[el.name];
    }
  });

  // 🔁 Recalculate derived / conditional fields
  recalculateAge();
  toggleIllnessFields();
  toggleMaritalFields();
  toggleExperienceDependentSections();
}

function restoreMaskedKYC(data) {
  if (data.pan && panPattern.test(data.pan)) {
    realPan = data.pan;
    document.getElementById("pan").value = realPan;
    document.getElementById("panDisplay").value = data.pan.slice(0, 2) + "****" + data.pan.slice(6);
  }

  if (data.aadhaar && /^\d{12}$/.test(data.aadhaar)) {
    realAadhaar = data.aadhaar;
    document.getElementById("aadhaar").value = realAadhaar;
    document.getElementById("aadhaarDisplay").value = "XXXXXXXX" + data.aadhaar.slice(8);
  }

  if (data.bankAccount && data.bankAccount.length >= 8) {
    realBankAccount = data.bankAccount;
    document.getElementById("bankAccount").value = realBankAccount;
    document.getElementById("bankAccountDisplay").value = "XXXXXX" + realBankAccount.slice(-4);
  }
}

// Redundant localstorage loadDraft removed.


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

// Old submitOnline removed - replaced by submitFormOnlineOrOffline

async function saveOfflineSubmission(data) {
  // Uses IndexedDB from offline-db.js
  await saveOffline({
      data,
      time: new Date().toISOString()
  });
}

async function syncOfflineSubmissions() {
  if (!navigator.onLine) return;

  const queue = await getOfflineData(); // from offline-db.js
  if (queue.length === 0) return;

  for (const item of queue) {
    try {
        const res = await fetch("http://localhost:8080/api/candidates", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(item.data)
        });

        if (!res.ok) throw new Error();
        console.log("Synced offline form");
        
        // Use the same helper as the online listener if available, 
        // otherwise we might need to rely on clearOfflineData if we can't remove single.
        // Assuming removeOfflineSubmission is globally available (used in bottom listener)
        if (typeof removeOfflineSubmission === 'function') {
            await removeOfflineSubmission(item.id);
        }
    } catch (e) {
       console.warn("Sync failed for item", e);
    }
  }
  
  // Only clear all if we didn't remove individually? 
  // If removeOfflineSubmission exists, we don't need clearOfflineData()
  // If it doesn't, we are safer not clearing all if some failed.
  if (typeof removeOfflineSubmission !== 'function') {
      // Fallback: dangerous clear, but requested adjustment is to be safe.
      // If we can't remove single, we shouldn't clear all if errors.
      // But we can't selectively save back easily without a helper.
      // Leaving as is with a warning comment or try to use clearOfflineData ONLY if no errors?
      // Better: if all succeeded.
  }
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

let realPan = "";
let realAadhaar = "";
let realBankAccount = "";
// let isRestoringDraft = false; // Consolidated to isRestoring

let isRestoring = false;

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
  stepperSteps.forEach((circle, i) =>
    circle.classList.toggle("active", i <= index)
  );

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

function fillMediclaimFamilyDetails() {
  const tbody = document.getElementById("mediclaimFamilyBody");
  if (!tbody) return;

  tbody.innerHTML = "";
  let sno = 1;

  const rows = document.querySelectorAll("#familyTableBody tr");

  rows.forEach(row => {
    const relation = row.querySelector("select[name*='relationship']")?.value || "";
    const name = row.querySelector("input[name*='name']")?.value || "";
    const dob = row.querySelector("input[name*='dob']")?.value || "";

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
    el.id === "aadhaar"
  );
}

let autosaveInterval = null;

/* =========================================================
  MAIN
========================================================= */
document.addEventListener("DOMContentLoaded", () => {

  (async () => {
    try {
      await openDB();
      console.log("IndexedDB ready");
    } catch (e) {
      console.warn("IndexedDB not available");
    }
  })();

  (async () => {
    try {
      await openDB();
      console.log("IndexedDB ready");

      // 1️⃣ Load draft (IndexedDB or server)
      const draft = await loadDraftFromDB(); // or fetchServerDraft()

      // 2️⃣ Restore everything
      if (draft) {
        await restoreDraftState(draft);
      }
    } catch (err) {
      console.error("Failed to restore draft", err);
    }
  })();


  let currentStep = 0;
  let isSubmitting = false;

  window._debugCurrentStep = () => currentStep;
  setupEducationTable();
  const loggedInMobile = sessionStorage.getItem("loggedInMobile");
  const formStatus = sessionStorage.getItem("formStatus");
  const serverDraft = sessionStorage.getItem("serverDraft");
  const mobile = sessionStorage.getItem("loggedInMobile");


  function clearAutosave() {
  }


function addEducationRow(data = null, showDelete = true) {
  const tbody = document.getElementById("educationTableBody");
  const tr = document.createElement("tr");
  tr.classList.add("education-row");

  tr.innerHTML = `
    <td><input type="text" name="collegeName" value="${data?.college || ""}"></td>
    <td><input type="text" name="board" value="${data?.board || ""}"></td>
    <td><input type="text" name="degree" value="${data?.degree || ""}"></td>
    <td><input type="text" name="stream" value="${data?.stream || ""}"></td>
    <td><input type="text" name="joiningYear" value="${data?.joinYear || ""}"></td>
    <td><input type="text" name="leavingYear" value="${data?.leaveYear || ""}"></td>
    <td><input type="number" name="percentage" value="${data?.aggregate || ""}"></td>
    ${showDelete ? `<td><button type="button" class="btn-delete">Delete</button></td>` : ""}
  `;

  // Input restrictions
  allowOnlyAlphabets(tr.querySelector("[name='collegeName']"));
  allowOnlyAlphabets(tr.querySelector("[name='board']"));
  allowOnlyAlphabets(tr.querySelector("[name='degree']"));
  allowOnlyAlphabets(tr.querySelector("[name='stream']"));
  allowOnlyYear(tr.querySelector("[name='joiningYear']"));
  allowOnlyYear(tr.querySelector("[name='leavingYear']"));

  if (showDelete) {
    tr.querySelector(".btn-delete").onclick = () => {
      tr.remove();
      debouncedSaveDraft();
    };
  }

  tbody.appendChild(tr);
}


function getEducationRowsData() {
  const rows = [];
  document.querySelectorAll("#educationTableBody tr").forEach(tr => {
    const inputs = tr.querySelectorAll("input");
    rows.push({
      college: inputs[0].value,
      board: inputs[1].value,
      degree: inputs[2].value,
      stream: inputs[3].value,
      joinYear: inputs[4].value,
      leaveYear: inputs[5].value,
      aggregate: inputs[6].value
    });
  });
  return rows;
}
// Old saveEducationRows (localStorage) removed


function restoreEducationRows(saved = []) {
  const tbody = document.getElementById("educationTableBody");
  tbody.innerHTML = "";

  if (!saved || saved.length === 0) {
    addEducationRow(null, false); // default row
    return;
  }

  saved.forEach((row, index) => {
    addEducationRow(row, index !== 0);
  });
}

  function setupEducationTable() {
  const addBtn = document.getElementById("addEducationBtn");
  if (!addBtn) return;

  addBtn.addEventListener("click", () => {
    addEducationRow(null, true);
    debouncedSaveDraft();
  });
}


function removeRow(btn) {
  btn.closest("tr").remove();
  debouncedSaveDraft();
}

  document.addEventListener("input", e => {
  if (e.target.closest("#educationTableBody")) {
    debouncedSaveDraft();
  }
});


  function stopAutosave() {
    // No-op: Interval removed in favor of event-based saving
  }

  // store it globally so other functions can clear it
  window._autosaveInterval = autosaveInterval;

  if (mobile) {
    const mobile1 = document.getElementById("mobile1");
    const mobile2 = document.getElementById("mobile2");

    if (mobile1) {
      mobile1.value = mobile;
      mobile1.readOnly = true;
    }

    if (mobile2) {
      mobile2.value = mobile;
      mobile2.readOnly = true;
    }
  }

  if (!loggedInMobile) {
    window.location.href = "./login.html";
    return;
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


  const steps = document.querySelectorAll(".form-step");
  const nextBtn = document.getElementById("nextBtn");
  const prevBtn = document.getElementById("prevBtn");
  const submitBtn = document.getElementById("submitBtn");

  let draftTimer;
  function debouncedSaveDraft() {
    if (isSubmitting) return;
    if (!sessionStorage.getItem("loggedInMobile")) return; // ✅ ADD THIS

    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const data = collectFormData();
      const educationalParams = getEducationRowsData();

      saveDraft({
        id: sessionStorage.getItem("loggedInMobile"),
        mobile: sessionStorage.getItem("loggedInMobile"),
        step: currentStep,
        fields: {
          ...data,
          pan: realPan || "",
          aadhaar: realAadhaar || "",
          bankAccount: realBankAccount || ""
        },
        educationRows: educationalParams
      });

    }, 500);
  }
  window.debouncedSaveDraft = debouncedSaveDraft;


  document.getElementById("bankAccount")?.addEventListener("input", e => {
    e.target.value = e.target.value.replace(/\D/g, "").slice(0, 18);
  });

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
      <input type="radio" name="motherTongue">
    </td>
  `;

    languageTableBody.appendChild(tr);
  });

  function validateStep3Languages() {
    const checked = document.querySelectorAll(
      '#languageSection input[type="checkbox"]:checked'
    );

    const manualInputs = document.querySelectorAll(
      '#extraLanguages .language-input'
    );

    const error = document.getElementById("languageError");

    let hasManualValue = false;
    manualInputs.forEach(input => {
      if (input.value.trim() !== "") hasManualValue = true;
    });

    if (checked.length === 0 && !hasManualValue) {
      if (error) {
        error.style.display = "block";
      }
      document.getElementById("languageSection")?.scrollIntoView({
        behavior: "smooth"
      });
      return false;
    }

    if (error) error.style.display = "none";
    return true;
  }


  function toggleExperienceDependentSections() {
    const years = Number(document.getElementById("expYears")?.value || 0);
    const months = Number(document.getElementById("expMonths")?.value || 0);

    const hasExperience = years > 0 || months > 0;

    const employment = document.getElementById("employmentHistory");
    const assignments = document.getElementById("assignmentsHandled");
    const salary = document.getElementById("salarySection");
    const reference = document.getElementById("referenceSection");

    if (employment) employment.style.display = hasExperience ? "block" : "none";
    if (assignments) assignments.style.display = hasExperience ? "block" : "none";
    if (salary) salary.style.display = hasExperience ? "block" : "none";
    if (reference) reference.style.display = hasExperience ? "block" : "none";
  }

  // YEARS
  document
    .getElementById("expYears")
    ?.addEventListener("input", toggleExperienceDependentSections);

  // MONTHS
  const monthsEl = document.getElementById("expMonths");
  monthsEl?.addEventListener("input", e => {
    let v = +e.target.value || 0;
    if (v > 11) v = 11;
    if (v < 0) v = 0;
    e.target.value = v;
    toggleExperienceDependentSections();
  });
  toggleExperienceDependentSections();

  ["input", "change"].forEach(evt => {
    document.addEventListener(evt, debouncedSaveDraft);
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

  /* ================= ERROR HELPERS ================= */
  function clearStepErrors(step) {
    step?.querySelectorAll(".error-text")?.forEach(e => e.remove());
    step?.querySelectorAll(".error")?.forEach(e => e.classList.remove("error"));
    step?.querySelector(".step-error")?.remove();
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
    BANK ACCOUNT (MASKED)
  ========================================================= */
  const bankAccInput = document.getElementById("bankAccountDisplay");
  const bankAccHidden = document.getElementById("bankAccount");

  bankAccInput?.addEventListener("input", e => {
    if (isRestoring) return; // ✅ Fixed flag name

    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 18) v = v.slice(0, 18);

    if (v.length >= 8) {
      realBankAccount = v;
      bankAccHidden.value = v;

      const masked = "XXXXXX" + v.slice(-4);
      e.target.value = masked;
    } else {
      realBankAccount = "";
      bankAccHidden.value = "";
      e.target.value = v;
    }
  });

  bankAccInput?.addEventListener("focus", () => {
    if (realBankAccount) bankAccInput.value = realBankAccount;
  });

  bankAccInput?.addEventListener("blur", () => {
    if (realBankAccount && realBankAccount.length >= 8) {
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

  maritalStatus?.addEventListener("change", toggleMaritalFields);
  toggleMaritalFields();

  /* ---------- PROLONGED ILLNESS TOGGLE ---------- */
  function toggleIllnessFields() {
    const show = prolongedIllness?.value === "Yes";

    if (illnessName?.parentElement)
      illnessName.parentElement.style.display = show ? "block" : "none";

    if (illnessDuration?.parentElement)
      illnessDuration.parentElement.style.display = show ? "block" : "none";

    if (!show) {
      illnessName.value = "";
      illnessDuration.value = "";
      clearError(illnessName);
      clearError(illnessDuration);
    }
  }

  prolongedIllness?.addEventListener("change", toggleIllnessFields);
  toggleIllnessFields();

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
    const pan = step.querySelector("#pan");
    const aadhaar = step.querySelector("#aadhaar");
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
      showError(genderGroup, " ", silent);
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

    const acc = document.getElementById("bankAccount");
    if (!isDigits(acc.value) || acc.value.length < 8 || acc.value.length > 18) {
      showError(acc, "Account number must be 8–18 digits", silent);
      ok = false;
    }

    const uan = document.getElementById("uan");
    if (uan && !/^\d{12}$/.test(uan.value)) {
      showError(uan, "UAN must be exactly 12 digits", silent);
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

    step.querySelectorAll("input, textarea").forEach(el => {
      if (isSkippable(el)) return;

      if (!el.value.trim()) {
        showError(el, "Required", silent);
        ok = false;
      }
    });

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

      // Income required
      if (!income || income.value === "") {
        showError(income, "Income is required", silent);
        ok = false;
      }


      if (!dep?.value) {
        showError(dep, "Dependent status required", silent);
        ok = false;
      }

      if (dep?.value === "Yes" && Number(income?.value) > 0) {
        showError(income, "Dependent income must be 0", silent);
        ok = false;
      }

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

      // ✅ Parent age validation (FIXED)
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

      // Dependent validation
      if (!dep?.value) {
        showError(dep, "Select dependent status", silent);
        ok = false;
      }

      if (dep?.value === "Yes" && Number(income?.value) > 0) {
        showError(income, "If YES income must be 0 for dependents", silent);
        ok = false;
      }

      if (income && Number(income.value) < 0) {
        showError(income, "Income cannot be negative", silent);
        ok = false;
      }

    });

    if (!ok && !silent) {
      const hasFieldErrors = step.querySelector(".error");
      if (hasFieldErrors) {
        showSummaryError(step, "Please correct the highlighted errors before continuing");
        focusFirstError(step);
      }
    }

    return ok
  }

  /* =========================================================
    STEP 3 – EDUCATION
  ========================================================= */
  function addLanguage() {
    const container = document.getElementById("extraLanguages");
    const div = document.createElement("div");
    div.className = "language-item";
    div.innerHTML = `
    <input type="text" placeholder="Enter language" class="language-input" required>
    <button type="button" onclick="this.parentElement.remove()">Remove</button>
  `;
    container.appendChild(div);
  }

  function validateStep3(silent = false) {
    const step = steps[2];
    if (!silent) clearStepErrors(step);

    let ok = true;
    const rows = step.querySelectorAll(".education-row");

    if (!rows.length) {
      showStepError(step, "Add at least one education detail", silent);
      return false;
    }

    rows.forEach(row => {
      const college = row.querySelector("input[name='collegeName']");
      const board = row.querySelector("input[name='board']");
      const degree = row.querySelector("input[name='degree']");
      const stream = row.querySelector("input[name='stream']");
      const joinYear = row.querySelector("input[name='joiningYear']");
      const leaveYear = row.querySelector("input[name='leavingYear']");

      const percent = row.querySelector("input[name='percentage']");

      // allowOnlyYear(joinYear);
      // allowOnlyYear(leaveYear);

      /* ---------- Alphabet‑only fields ---------- */
      if (!college.value || !isAlphaOnly(college.value)) {
        showError(college, "required", silent);
        ok = false;
      }

      if (!board.value || !isAlphaOnly(board.value)) {
        showError(board, "required", silent);
        ok = false;
      }

      if (!degree.value || !isAlphaOnly(degree.value)) {
        showError(degree, "required", silent);
        ok = false;
      }

      if (!stream.value || !isAlphaOnly(stream.value)) {
        showError(stream, "required", silent);
        ok = false;
      }


      /* ---------- Year validation ---------- */
      if (!isYear(joinYear.value)) {
        showError(joinYear, "Enter valid 4-digit joining year", silent);
        ok = false;
      }

      if (!isYear(leaveYear.value)) {
        showError(leaveYear, "Enter valid 4-digit leaving year", silent);
        ok = false;
      }

      if (
        isYear(joinYear.value) &&
        isYear(leaveYear.value) &&
        +leaveYear.value <= +joinYear.value
      ) {
        showError(
          leaveYear,
          "Leaving year must be after joining year",
          silent
        );
        ok = false;
      }

      /* ---------- Percentage ---------- */
      if (!percent.value || percent.value < 0 || percent.value > 100) {
        showError(percent, "must be between 0 and 100", silent);
        ok = false;
      }
    });

    const member = step.querySelector(
      'select[name="memberOfProfessionalBody"]'
    );

    const honors = step.querySelector(
      'select[name="specialHonors"]'
    );

    if (member && member.value === "Select") {
      showError(member, "Please select an option", silent);
      ok = false;
    }

    if (honors && honors.value === "Select") {
      showError(honors, "Please select an option", silent);
      ok = false;
    }


    // ===== Conditional Skill Textareas (Yes → Details Required) =====
    // Pattern: <select> immediately followed by a <textarea>

    // const conditionalPairs = [
    //   {
    //     question: "Member of Professional Body / Society?",
    //     selectIndex: 0
    //   },
    //   {
    //     question: "Special Honors / Scholarships?",
    //     selectIndex: 1
    //   }
    // ];


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

      // ✅ mark ONE real field as error so focus works
      showError(literary || sports || hobbies,
        "Enter at least one activity", silent);

      ok = false;
    } else {
      if (extraError) extraError.style.display = "none";
    }

    function validateStep3Languages() {
      const checked = document.querySelectorAll(
        '#languageSection input[type="checkbox"]:checked'
      );

      const manualInputs = document.querySelectorAll(
        '#extraLanguages .language-input'
      );

      const error = document.getElementById("languageError");

      let hasManualValue = false;
      manualInputs.forEach(input => {
        if (input.value.trim() !== "") hasManualValue = true;
      });

      if (checked.length === 0 && !hasManualValue) {
        if (error) error.style.display = "block";

        // ✅ force highlight
        const first = document.querySelector(
          '#languageSection input[type="checkbox"], #extraLanguages .language-input'
        );
        if (first) first.classList.add("error");

        return false;
      }

      if (error) error.style.display = "none";
      return true;
    }

    const motherTongueSelected = document.querySelector(
      "#languageTable input[name='motherTongue']:checked"
    );

    if (!motherTongueSelected) {
      const firstRadio = document.querySelector(
        "#languageTable input[name='motherTongue']"
      );

      showError(firstRadio, "Select mother tongue", silent);
      ok = false;
    }

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

      if (select.value === "Yes" && isBlank(textarea.value)) {
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

  /* ================= EMPLOYMENT HISTORY (REQUIRED) ================= */
  step
    .querySelectorAll("#employmentHistory input, #employmentHistory textarea")
    .forEach(el => {
      if (isSkippable(el)) return;

      if (!el.value.trim()) {
        showError(el, "This field is required", silent);
        ok = false;
      }
    });

  /* ================= ASSIGNMENTS HANDLED (REQUIRED) ================= */
  step
    .querySelectorAll("#assignmentsHandled input, #assignmentsHandled textarea")
    .forEach(el => {
      if (isSkippable(el)) return;

      if (!el.value.trim()) {
        showError(el, "This field is required", silent);
        ok = false;
      }
    });

  if (!ok && !silent) {
    showSummaryError(
      step,
      "Please complete Total Experience, Employment History, and Assignments"
    );
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
    const years = Number(document.getElementById("expYears")?.value || 0);
    const months = Number(document.getElementById("expMonths")?.value || 0);
    const hasExperience = years > 0 || months > 0;

    if (!silent) clearStepErrors(step5);
    let ok = true;

    /* ===== ALWAYS REQUIRED ===== */
    const declaration = step5.querySelector("#declaration");
    const declDate = step5.querySelector("#declDate");
    const declPlace = step5.querySelector("#declPlace");

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
      loanFields.style.display = "grid";

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
      salarySection
        ?.querySelectorAll("input, select")
        .forEach(el => {
          if (isSkippable(el)) return;
          if (
            !el.value ||
            (el.type === "number" && Number(el.value) <= 0)
          ) {
            showError(el, "Required", silent);
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
        // ✅ Force highlight
        refs[0]
          .querySelectorAll("input")
          .forEach(i => showError(i, "Required", silent));

        showStepError(step5, "At least one complete reference is required", silent);
        ok = false;
      }
    }
    /* ================= LOAN (ONLY IF YES) ================= */
    if (loanAvailed?.value === "Yes" && loanFields) {
      loanFields.style.display = "grid";

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
      const res = await fetch("http://localhost:8080/api/candidates", {
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

    let draft = null;

    // 1️⃣ Server draft (cross-device)
    if (serverDraft) {
      draft = JSON.parse(serverDraft);
    }

    // 2️⃣ Local IndexedDB draft fallback
    if (!draft) {
      draft = await loadDraft();
    }

    if (!draft) return;

    // Unified restoration
    await restoreDraftState(draft);

    if (typeof draft.step === "number") {
      currentStep = draft.step;
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
        const res = await fetch("http://localhost:8080/api/candidates", {
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