(() => {
  "use strict";

  const loginForm = document.getElementById("loginForm");
  const demoActions = document.getElementById("demoActions");
  const registerForm = document.getElementById("registerForm");
  const loginTab = document.getElementById("loginTab");
  const registerTab = document.getElementById("registerTab");
  const message = document.getElementById("authMessage");
  const title = document.getElementById("formTitle");
  const description = document.getElementById("formDescription");

  document.getElementById("year").textContent = String(new Date().getFullYear());

  function showMessage(text, success) {
    message.textContent = text;
    message.classList.toggle("success", Boolean(success));
    message.hidden = false;
  }

  function setMode(mode) {
    const registering = mode === "register";
    loginForm.hidden = registering;
    demoActions.hidden = registering;
    registerForm.hidden = !registering;
    loginTab.classList.toggle("selected", !registering);
    registerTab.classList.toggle("selected", registering);
    loginTab.setAttribute("aria-selected", String(!registering));
    registerTab.setAttribute("aria-selected", String(registering));
    title.textContent = registering ? "Set up your business" : "Sign in to your business";
    description.textContent = registering
      ? "Create your private workspace in just a few details."
      : "Pick up right where your business left off.";
    message.hidden = true;
  }

  async function submitForm(form, endpoint) {
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const body = Object.fromEntries(new FormData(form).entries());
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(body)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not complete the request.");
      window.location.assign("/workspace.html");
    } catch (error) {
      showMessage(error.message || "Unable to reach eParchi. Check your connection and try again.");
    } finally {
      submit.disabled = false;
    }
  }

  loginTab.addEventListener("click", () => setMode("login"));
  registerTab.addEventListener("click", () => setMode("register"));
  loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(loginForm, "/api/auth/login");
  });
  function createDemoBranding() {
    const stamp = document.createElement("canvas");
    stamp.width = 400;
    stamp.height = 400;
    const stampContext = stamp.getContext("2d");
    stampContext.strokeStyle = "#174f4d";
    stampContext.fillStyle = "#174f4d";
    stampContext.textAlign = "center";
    stampContext.textBaseline = "middle";
    stampContext.lineWidth = 9;
    stampContext.beginPath();
    stampContext.arc(200, 200, 178, 0, Math.PI * 2);
    stampContext.stroke();
    stampContext.lineWidth = 2;
    stampContext.beginPath();
    stampContext.arc(200, 200, 157, 0, Math.PI * 2);
    stampContext.stroke();
    stampContext.font = "700 23px Arial";
    stampContext.fillText("DEMO SAMPLE", 200, 132, 275);
    stampContext.font = "700 28px Arial";
    stampContext.fillText("MOBILE SHOP", 200, 200, 275);
    stampContext.font = "600 21px Arial";
    stampContext.fillText("PUNE", 200, 258, 240);

    const signature = document.createElement("canvas");
    signature.width = 640;
    signature.height = 180;
    const signatureContext = signature.getContext("2d");
    signatureContext.strokeStyle = "#233e43";
    signatureContext.fillStyle = "#233e43";
    signatureContext.lineWidth = 5;
    signatureContext.lineCap = "round";
    signatureContext.lineJoin = "round";
    signatureContext.beginPath();
    signatureContext.moveTo(42, 105);
    signatureContext.bezierCurveTo(87, 28, 91, 145, 132, 91);
    signatureContext.bezierCurveTo(171, 37, 162, 143, 207, 97);
    signatureContext.bezierCurveTo(247, 57, 259, 126, 300, 91);
    signatureContext.stroke();
    signatureContext.font = "italic 34px cursive";
    signatureContext.fillText("Demo Signature", 325, 105);
    signatureContext.font = "700 14px Arial";
    signatureContext.fillText("SAMPLE ONLY", 320, 146);

    return {
      stampUrl: stamp.toDataURL("image/png"),
      signatureUrl: signature.toDataURL("image/png")
    };
  }

  async function openDemo(button) {
    button.disabled = true;
    const otherButtons = Array.from(demoActions.querySelectorAll("button"));
    otherButtons.forEach((item) => { item.disabled = true; });
    try {
      const response = await fetch("/api/auth/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ role: button.dataset.demoRole, branding: createDemoBranding() })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not open the demo workspace.");
      window.location.assign("/workspace.html");
    } catch (error) {
      showMessage(error.message || "Unable to reach the demo workspace. Check your connection and try again.");
    } finally {
      otherButtons.forEach((item) => { item.disabled = false; });
    }
  }

  demoActions.querySelectorAll("[data-demo-role]").forEach((button) => {
    button.addEventListener("click", () => openDemo(button));
  });
  registerForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitForm(registerForm, "/api/auth/register-tenant");
  });

  fetch("/api/auth/me", { credentials: "same-origin" })
    .then((response) => {
      if (response.ok) window.location.replace("/workspace.html");
    })
    .catch(() => showMessage("The server could not be reached. You can try signing in again once it is available."));
})();
