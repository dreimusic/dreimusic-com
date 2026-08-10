document.getElementById("year").textContent = new Date().getFullYear();

const form = document.getElementById("leadForm");
const submitBtn = document.getElementById("leadSubmitBtn");
const errorEl = document.getElementById("leadFormError");
const successEl = document.getElementById("leadSuccess");

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  errorEl.hidden = true;

  const email = document.getElementById("leadEmail").value.trim();
  const company = form.elements.company.value; // honeypot

  submitBtn.disabled = true;
  submitBtn.textContent = "Sending…";

  try {
    const res = await fetch("/api/free-guides-signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, company }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("Something went wrong on our end. Try again in a moment.");
    }

    if (!res.ok) {
      throw new Error(data.error || "Something went wrong. Try again.");
    }

    form.hidden = true;
    successEl.hidden = false;
  } catch (err) {
    errorEl.textContent = err.message || "Something went wrong. Try again.";
    errorEl.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Send Me The Guides";
  }
});
