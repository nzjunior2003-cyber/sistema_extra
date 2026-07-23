import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { Resend } from "resend";
import dotenv from "dotenv";
import dns from "dns";

dotenv.config();


async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

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
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
