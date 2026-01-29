document.addEventListener("DOMContentLoaded", async () => {
  try {
    await openDB();
    console.log("IndexedDB ready");
  } catch (e) {
    console.warn("IndexedDB not available");
  }
});
/* =========================================================
  GLOBAL HELPERS
========================================================= */
const isFutureDate = d => d && new Date(d) > new Date();
const minLen = (v, l) => v && v.trim().length >= l;
// const onlyNumbers = v => /^\d+$/.test(v);

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
let isRestoringDraft = false;

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
  rel.addEventListener("change", () => syncParentNameToFamilyRow(tr));
};

function syncParentNameToFamilyRow(row) {
  const rel = row.querySelector("select[name*='relationship']");
  const nameInput = row.querySelector("input[name*='name']");

  if (!rel || !nameInput) return;

  const fatherName = document.getElementById("fatherName")?.value || "";
  const motherName = document.getElementById("motherName")?.value || "";

  if (rel.value === "Father" && fatherName) {
    nameInput.value = fatherName;
  }

  if (rel.value === "Mother" && motherName) {
    nameInput.value = motherName;
  }
}

/* =========================================================
  MAIN
========================================================= */
document.addEventListener("DOMContentLoaded", () => {

  let currentStep = 0;
  window._debugCurrentStep = () => currentStep;
  let isSubmitting = false;
  const loggedInMobile = sessionStorage.getItem("loggedInMobile");
  const formStatus = sessionStorage.getItem("formStatus");
  const serverDraft = sessionStorage.getItem("serverDraft");

  if (!loggedInMobile) {
    window.location.href = "./login.html";
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
  const steps = document.querySelectorAll(".form-step");
  const nextBtn = document.getElementById("nextBtn");
  const prevBtn = document.getElementById("prevBtn");
  const submitBtn = document.getElementById("submitBtn");

  document
    .querySelectorAll("#mediclaimFamilyBody tr")
    .forEach(row => {
      row
        .querySelector("select[name*='relationship']")
        ?.addEventListener("change", () => syncParentNameToFamilyRow(row));
    });

  let draftTimer;
  function debouncedSaveDraft() {
    if (isSubmitting) return;
    if (!sessionStorage.getItem("loggedInMobile")) return; // ✅ ADD THIS

    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      const data = collectFormData();

      saveDraft({
        id: sessionStorage.getItem("loggedInMobile"),
        mobile: sessionStorage.getItem("loggedInMobile"),
        step: currentStep,
        fields: {
          ...data,
          pan: realPan || "",
          aadhaar: realAadhaar || ""
        }
      });

    }, 500);
  }


  function syncAllParentRows() {
    document.querySelectorAll("#familyTableBody tr").forEach(row => {
      syncParentNameToFamilyRow(row);
    });
  }

  document.getElementById("fatherName")?.addEventListener("input", syncAllParentRows);
  document.getElementById("motherName")?.addEventListener("input", syncAllParentRows);

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
  const uanPattern = /^\d{12}$/;

  /* =========================================================
    PAN + AADHAAR (CORRECTED)
  ========================================================= */
  const panInput = document.getElementById("pan");
  const aadhaarInput = document.getElementById("aadhaar");

  panInput?.addEventListener("input", e => {
    let v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (v.length > 10) v = v.slice(0, 10);
    e.target.value = v;

    if (panPattern.test(v)) {
      realPan = v;
      e.target.value = v.slice(0, 2) + "****" + v.slice(6);
    }
  });

  panInput?.addEventListener("focus", () => realPan && (panInput.value = realPan));
panInput?.addEventListener("blur", () => {
  if (isRestoringDraft) return;
  if (panPattern.test(panInput.value)) {
    realPan = panInput.value;
    panInput.value =
      panInput.value.slice(0, 2) + "****" + panInput.value.slice(6);
  }
});


  aadhaarInput?.addEventListener("input", e => {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 12) v = v.slice(0, 12);
    e.target.value = v;

    if (aadhaarPlain.test(v)) {
      realAadhaar = v;
      e.target.value = "XXXXXXXX" + v.slice(8);
    }
  });

  aadhaarInput?.addEventListener("focus", () => realAadhaar && (aadhaarInput.value = realAadhaar));
  aadhaarInput?.addEventListener("blur", () => {
    if (aadhaarPlain.test(aadhaarInput.value)) {
      realAadhaar = aadhaarInput.value;
      aadhaarInput.value = "XXXXXXXX" + aadhaarInput.value.slice(8);
    }
  });

  const uanInput = document.getElementById("uan");
  uanInput?.addEventListener("input", e => {
    e.target.value = e.target.value
      .replace(/\D/g, "")
      .slice(0, 12);
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
      clearError(genderGroup); // ✅ remove existing error first
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

    // ----- Bank Details -----
    const acc = document.getElementById("bankAccount");
    if (!isDigits(acc.value) || acc.value.length < 8) {
      showError(acc, "Invalid account number", silent);
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
    // ----- PAN -----
    if (!realPan) {
      showError(pan, "PAN is required", silent);
      ok = false;
    } else if (!panPattern.test(realPan)) {
      showError(pan, "Invalid PAN format (ABCDE1234F)", silent);
      ok = false;
    }

    // ----- Aadhaar -----
    if (!realAadhaar) {
      showError(aadhaar, "Aadhaar is required", silent);
      ok = false;
    } else if (!aadhaarPlain.test(realAadhaar)) {
      showError(aadhaar, "Aadhaar must be 12 digits", silent);
      ok = false;
    }


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
      const income = row.querySelector("input[name*='income']");

      // Required fields
      if (!rel?.value) {
        showError(rel, "Required", silent);
        ok = false;
      }

      if (!isAlpha(name?.value)) {
        showError(name, "Invalid name", silent);
        ok = false;
      }

      if (!dob?.value || isFutureDate(dob.value)) {
        showError(dob, "Invalid DOB", silent);
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

    return ok;

  }

  /* =========================================================
    STEP 3 – EDUCATION
  ========================================================= */
  function validateStep3(silent = false) {
    const step = steps[2];
    if (!silent) clearStepErrors(step);
    let ok = true;
    const join = step.querySelector('[placeholder="Joining Year"]');
    const leave = step.querySelector('[placeholder="Leaving Year"]');
    const percent = step.querySelector('[placeholder="Aggregate Percentage"]');


    const college = step.querySelector('[placeholder="College / School Name"]');

    if (isBlank(college.value)) {
      showError(college, "Institution required", silent);
      ok = false;
    }

    // ----- Degree & Stream required -----
    const degree = step.querySelector('[placeholder="Degree / Exam"]');
    const stream = step.querySelector('[placeholder="Stream / Branch"]');
    const board = step.querySelector('[placeholder="Board / University"]');
    if (isBlank(degree.value)) {
      showError(degree, "Degree is required", silent);
      ok = false;
    }

    if (isBlank(stream.value)) {
      showError(stream, "Stream is required", silent);
      ok = false;
    }
    // ----- Board / University (REQUIRED) -----

    if (isBlank(board.value)) {
      showError(board, "Board / University is required", silent);
      ok = false;
    }
    if (!inRange(join.value, 1950, new Date().getFullYear())) {
      showError(join, "Invalid year", silent);
      ok = false;
    }


    if (+leave.value <= +join.value) {
      showError(leave, "Leaving must be after joining", silent);
      ok = false;
    }

    // ----- 4-digit year enforcement -----
    const yearPattern = /^\d{4}$/;

    if (!yearPattern.test(join.value)) {
      showError(join, "Enter a valid 4‑digit year", silent);
      ok = false;
    }

    if (!yearPattern.test(leave.value)) {
      showError(leave, "Enter a valid 4‑digit year", silent);
      ok = false;
    }


    // ----- Aggregate Percentage (REQUIRED) -----
    if (isBlank(percent.value)) {
      showError(percent, "Aggregate percentage is required", silent);
      ok = false;
    } else if (+percent.value < 0 || +percent.value > 100) {
      showError(percent, "Percentage must be between 0 and 100", silent);
      ok = false;
    }

    step.querySelectorAll("textarea").forEach(t => {
      if (t.value.length > 500) {
        showError(t, "Max 500 characters", silent);
        ok = false;
      }
    });

    // ===== Conditional Skill Textareas (Yes → Details Required) =====
    // Pattern: <select> immediately followed by a <textarea>

    const conditionalPairs = [
      {
        question: "Member of Professional Body / Society?",
        selectIndex: 0
      },
      {
        question: "Special Honors / Scholarships?",
        selectIndex: 1
      }
    ];

    const extracurricular = step.querySelector(
      'textarea[placeholder^="Literary"]'
    );
    if (isBlank(extracurricular.value)) {
      showError(extracurricular, "Extra‑curricular activities required", silent);
      ok = false;
    }

    const languages = step.querySelector(
      'textarea[placeholder="Languages"]'
    );
    if (isBlank(languages.value)) {
      showError(languages, "Languages known is required", silent);
      ok = false;
    }

    const strengths = step.querySelector('textarea[placeholder="Strengths"]');
    const weaknesses = step.querySelector('textarea[placeholder="Weaknesses"]');

    if (isBlank(strengths.value)) {
      showError(strengths, "Strengths are required", silent);
      ok = false;
    }

    if (isBlank(weaknesses.value)) {
      showError(weaknesses, "Weaknesses are required", silent);
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
      showSummaryError(step, "Please correct the highlighted errors before continuing");
      focusFirstError(step);
    }
    return ok;
  }

  /* =========================================================
    STEP 4 – EXPERIENCE
  ========================================================= */
  const employmentRequiredSelectors = [
    '#employmentHistory input[type="text"]',
    '#employmentHistory input[type="date"]',
    '#employmentHistory textarea'
  ];

  const assignmentRequiredSelectors = [
    '#assignmentsHandled input[type="text"]',
    '#assignmentsHandled textarea'
  ];
  function validateStep4(silent = false) {
    const step = steps[3];
    if (!silent) clearStepErrors(step);

    let ok = true;

    const years = Number(document.getElementById("expYears")?.value || 0);
    const months = Number(document.getElementById("expMonths")?.value || 0);
    const hasExperience = years > 0 || months > 0;

    // Fresher → skip entire step
    if (!hasExperience) return true;

    const yearsEl = step.querySelector("#expYears");
    const monthsEl = step.querySelector("#expMonths");

    if (yearsEl?.value === "" || monthsEl?.value === "") {
      showError(yearsEl, "Enter years and months", silent);
      showError(monthsEl, "Enter years and months", silent);
      ok = false;
    }

    // Employment History – required
    step.querySelectorAll("#employmentHistory input, #employmentHistory textarea")
      .forEach(el => {
        if (el.offsetParent === null) return;
        if (!el.value.trim()) {
          showError(el, "This field is required", silent);
          ok = false;
        }
      });

    // Assignments Handled – required
    step.querySelectorAll("#assignmentsHandled input, #assignmentsHandled textarea")
      .forEach(el => {
        if (el.offsetParent === null) return;
        if (!el.value.trim()) {
          showError(el, "This field is required", silent);
          ok = false;
        }
      });

    if (!ok && !silent) {
      showSummaryError(
        step,
        "Please complete all Employment History and Assignments fields"
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
          if (el.offsetParent === null) return;
          if (!el.value || Number(el.value) <= 0) {
            showError(el, "Required", silent);
            ok = false;
          }
        });

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

      /* ================= OTHER PARTICULARS (REQUIRED) ================= */
      otherSection
        ?.querySelectorAll("input, select, textarea")
        .forEach(el => {
          if (el.offsetParent === null) return;
          if (!el.value || !el.value.trim()) {
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
  function validateStep6() {
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

    currentStep++;
    updateUI();
  };

  /* ===== PREVIOUS BUTTON ===== */
  prevBtn.onclick = () => {
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
    for (let i = 0; i < steps.length; i++) {
      currentStep = i;
      updateUI();
      if (!validators[i](false)) return;
    }

    const formData = collectFormData(); // your form → JSON function
    await submitFormOnlineOrOffline(formData);
  };


  ///////////////---------collectFormData-------////////////,.......................................
  function collectFormData() {
    const form = document.getElementById("candidateForm");
    const data = {};

    form.querySelectorAll("input, select, textarea").forEach(el => {
      const key = el.name || el.id;
      if (!key) return;

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
      const res = await fetch("http://localhost:8080/candidates", {
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

  if (formStatus === "NEW") {
    sessionStorage.removeItem("serverDraft");
    clearDraft(); // clear IndexedDB draft
  }


  (async () => {
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

    Object.entries(draft.fields || {}).forEach(([key, val]) => {
      if (key === "pan" || key === "aadhaar") return;

      const el =
        document.getElementById(key) ||
        document.querySelector(`[name="${key}"]`);

      if (!el) return;

      if (el.type === "checkbox") el.checked = val;
      else if (el.type === "radio") {
        const r = document.querySelector(`[name="${el.name}"][value="${val}"]`);
        if (r) r.checked = true;
      } else {
        el.value = val;
      }
    });

  isRestoringDraft = true;
// restore PAN
if (draft.fields?.pan && panInput) {
  realPan = draft.fields.pan;
  panInput.value = realPan.slice(0, 2) + "****" + realPan.slice(6);
}

// restore Aadhaar
if (draft.fields?.aadhaar && aadhaarInput) {
  realAadhaar = draft.fields.aadhaar;
  aadhaarInput.value = "XXXXXXXX" + realAadhaar.slice(8);
}

isRestoringDraft = false;


    if (typeof draft.step === "number") {
      currentStep = draft.step;
    }

    toggleExperienceDependentSections();
    autoCalculateSalary();

    updateUI();
    setTimeout(() => {
      if (dobInput?.value) {
        dobInput.dispatchEvent(new Event("change"));
      }
    }, 0);

  })();

  /* ================= ONLINE SYNC ================= */
  window.addEventListener("online", () => {
    console.log("Back online – sync triggered");
  });

  updateUI();
  updateNextVisualState();
}); 