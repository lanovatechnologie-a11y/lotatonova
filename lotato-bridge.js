(function () {
  console.log("✅ Lotato Bridge chargé");

  /* ===============================
     1. TOKEN
  =============================== */
  const params = new URLSearchParams(window.location.search);
  const TOKEN = params.get("token");

  if (!TOKEN) {
    console.error("❌ Token manquant");
    return;
  }

  const API_HEADERS = {
    "Content-Type": "application/json",
    "x-auth-token": TOKEN
  };

  /* ===============================
     2. UTILS
  =============================== */
  function apiGet(url) {
    return fetch(url, { headers: API_HEADERS }).then(r => r.json());
  }

  function apiPost(url, body) {
    return fetch(url, {
      method: "POST",
      headers: API_HEADERS,
      body: JSON.stringify(body)
    }).then(r => r.json());
  }

  /* ===============================
     3. CHARGER LES TIRAGES
  =============================== */
  apiGet("/api/draws")
    .then(res => {
      if (!res.success) return;
      window.__LOTATO_DRAWS__ = res.draws;
      console.log("🎰 Tirages chargés", res.draws);
    })
    .catch(err => console.error("Erreur tirages", err));

  /* ===============================
     4. EXTRAIRE LE TICKET DE LOTATO
     (Lotato construit déjà ces données)
  =============================== */
  function buildTicketFromLotato() {
    if (!window.savedBets || window.savedBets.length === 0) {
      alert("Aucun pari");
      return null;
    }

    return {
      draw: window.currentDraw || "",
      draw_time: window.currentDrawTime || "morning",
      bets: window.savedBets,
      agentId: window.currentAgentId || null,
      agentName: window.currentAgentName || "Agent"
    };
  }

  /* ===============================
     5. INTERCEPTER LE BOUTON
     “ANREJISTRE & ENPRIME”
  =============================== */
  function hookSaveAndPrint() {
    const buttons = document.querySelectorAll("button");

    buttons.forEach(btn => {
      const txt = btn.innerText.toLowerCase();
      if (txt.includes("anrej") || txt.includes("enreg")) {
        btn.addEventListener("click", () => {
          const ticket = buildTicketFromLotato();
          if (!ticket) return;

          console.log("📤 Envoi ticket", ticket);

          apiPost("/api/tickets", ticket)
            .then(res => {
              if (!res.success) {
                alert("Erreur enregistrement");
                return;
              }

              console.log("✅ Ticket enregistré", res.ticket);

              // laisser Lotato imprimer normalement
            })
            .catch(err => {
              console.error("❌ Erreur API ticket", err);
              alert("Erreur serveur");
            });
        }, true);
      }
    });
  }

  setTimeout(hookSaveAndPrint, 1500);

  /* ===============================
     6. RÉSULTATS (OPTIONNEL)
  =============================== */
  window.loadLatestResults = function () {
    apiGet("/api/results/latest")
      .then(res => {
        if (!res.success) return;
        window.__LOTATO_RESULTS__ = res.results;
        console.log("🏆 Résultats reçus", res.results);
      });
  };

  /* ===============================
     7. SESSION CHECK
  =============================== */
  apiGet("/api/auth/check")
    .then(res => {
      if (!res.success) {
        alert("Session expirée");
        window.location.href = "/";
      } else {
        window.currentAgentId = res.admin.id;
        window.currentAgentName = res.admin.name;
      }
    });

})();