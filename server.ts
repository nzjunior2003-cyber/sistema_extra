import express from "express";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import dotenv from "dotenv";
import dns from "dns";

dotenv.config();

interface ServerDb {
  roleRequests: any[];
  customUsers: Record<string, any>;
}

const SERVER_DB_PATH = path.join(process.cwd(), 'server_db.json');

function getDb(): ServerDb {
  try {
    if (fs.existsSync(SERVER_DB_PATH)) {
      const content = fs.readFileSync(SERVER_DB_PATH, 'utf-8');
      const parsed = JSON.parse(content);
      return {
        roleRequests: Array.isArray(parsed.roleRequests) ? parsed.roleRequests : [],
        customUsers: parsed.customUsers && typeof parsed.customUsers === 'object' ? parsed.customUsers : {}
      };
    }
  } catch (err) {
    console.error("Error reading server_db.json:", err);
  }
  return { roleRequests: [], customUsers: {} };
}

function saveDb(data: ServerDb) {
  try {
    fs.writeFileSync(SERVER_DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error("Error writing server_db.json:", err);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // --- API ROUTES FOR SHARED ROLE REQUESTS & CUSTOM USERS ---

  app.get("/api/role-requests", (req, res) => {
    const db = getDb();
    res.json({ requests: db.roleRequests });
  });

  app.post("/api/role-requests", (req, res) => {
    const { request, requests } = req.body;
    const db = getDb();

    if (Array.isArray(requests)) {
      requests.forEach((r: any) => {
        if (!r || !r.id) return;
        const idx = db.roleRequests.findIndex((x: any) => x.id === r.id);
        if (idx >= 0) {
          db.roleRequests[idx] = { ...db.roleRequests[idx], ...r };
        } else {
          db.roleRequests.push(r);
        }
      });
    } else if (request && request.id) {
      const cleanMat = request.matricula ? request.matricula.split(/[-/\s.]/)[0] : '';
      const idx = db.roleRequests.findIndex((x: any) => 
        x.id === request.id || 
        ((x.matricula === request.matricula || (cleanMat && x.matricula && x.matricula.split(/[-/\s.]/)[0] === cleanMat)) && x.role === request.role && x.status === 'PENDING')
      );
      if (idx >= 0) {
        db.roleRequests[idx] = { ...db.roleRequests[idx], ...request };
      } else {
        db.roleRequests.push(request);
      }
    }

    saveDb(db);
    res.json({ success: true, requests: db.roleRequests });
  });

  app.put("/api/role-requests/:id", (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    const db = getDb();

    const idx = db.roleRequests.findIndex((r: any) => r.id === id);
    if (idx >= 0) {
      db.roleRequests[idx].status = status;
      saveDb(db);
      return res.json({ success: true, requests: db.roleRequests });
    }

    res.status(404).json({ error: "Solicitação não encontrada" });
  });

  app.delete("/api/role-requests", (req, res) => {
    const db = getDb();
    db.roleRequests = [];
    saveDb(db);
    res.json({ success: true });
  });

  app.get("/api/custom-users", (req, res) => {
    const db = getDb();
    res.json({ customUsers: db.customUsers });
  });

  app.post("/api/custom-users", (req, res) => {
    const { matricula, user, customUsers } = req.body;
    const db = getDb();

    if (customUsers && typeof customUsers === 'object') {
      db.customUsers = { ...db.customUsers, ...customUsers };
    } else if (matricula && user) {
      const cleanMat = matricula.split(/[-/\s.]/)[0];
      db.customUsers[matricula] = user;
      if (cleanMat) db.customUsers[cleanMat] = user;
    }

    saveDb(db);
    res.json({ success: true, customUsers: db.customUsers });
  });

  app.post("/api/validate-email", (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ valid: false, error: "Email não fornecido." });

    const parts = email.split("@");
    if (parts.length !== 2) return res.status(400).json({ valid: false, error: "Formato de e-mail inválido." });

    const domain = parts[1];
    dns.resolveMx(domain, (err, addresses) => {
      if (err || addresses.length === 0) {
        return res.status(200).json({ valid: false, error: "Domínio de e-mail não possui registro MX válido." });
      }
      return res.status(200).json({ valid: true });
    });
  });

  // Proxy endpoint to send email using Resend
  app.post("/api/send-email", async (req, res) => {
    const { to, subject, html } = req.body;
    
    if (!process.env.RESEND_API_KEY) {
      console.warn("Attempted to send email but RESEND_API_KEY is not configured.");
      console.warn("Email details:", { to, subject, html });
      return res.status(200).json({ success: true, simulated: true, note: "API Key ausente. E-mail simulado no console." });
    }

    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const data = await resend.emails.send({
        from: "Plataforma Escalas <onboarding@resend.dev>", // Default test email from Resend
        to,
        subject,
        html,
      });

      if (data.error) {
         return res.status(500).json({ error: data.error.message });
      }

      res.status(200).json({ success: true, data });
    } catch (error: any) {
      console.error("Error sending email:", error);
      res.status(500).json({ error: "Erro ao enviar e-mail. Verifique o servidor." });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
