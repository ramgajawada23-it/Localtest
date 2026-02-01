// Login.js
document.getElementById("loginForm").onsubmit = async (e) => {
  e.preventDefault();

  const mobile = document.getElementById("loginMobile").value.trim();
  const error = document.querySelector(".error-text");

  if (!/^\d{10}$/.test(mobile)) {
    error.innerText = "Enter valid 10-digit mobile number";
    return;
  }

  error.innerText = "";

  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobile })
    });

    if (!res.ok) throw new Error("API error");

    const data = await res.json();

    sessionStorage.setItem("loggedInMobile", mobile);

    if (data.status === "DRAFT") {
      sessionStorage.setItem("serverDraft", JSON.stringify(data.draft));
      sessionStorage.setItem("formStatus", "DRAFT");
    } else if (data.status === "SUBMITTED") {
      sessionStorage.removeItem("serverDraft");
      sessionStorage.setItem("formStatus", "SUBMITTED");
    } else {
      sessionStorage.removeItem("serverDraft");
      sessionStorage.setItem("formStatus", "NEW");
    }

    window.location.href = "./index.html";

  } catch (err) {
    console.warn("Backend not ready, continuing frontend flow");

    // ✅ fallback so frontend still works
    sessionStorage.setItem("loggedInMobile", mobile);
    sessionStorage.setItem("formStatus", "NEW");
    window.location.href = "./index.html";
  }
};