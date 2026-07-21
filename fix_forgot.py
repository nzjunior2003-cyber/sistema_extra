import re

with open("App.tsx", "r") as f:
    content = f.read()

replacement = """const response = await fetch('/api/send-email', {
               method: 'POST',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({
                  to: forgotEmail,
                  subject: 'Sistema de Escalas - Senha Temporária',
                  html: `<div style="font-family: sans-serif; p: 20px;">
                          <h2>Recuperação de Acesso</h2>
                          <p>Sua nova senha temporária para o sistema é: <strong>${tempPassword}</strong></p>
                          <p>Por favor, faça o login informando a matrícula e esta senha. O sistema pedirá para você cadastrar uma nova senha e confirmar seu e-mail.</p>
                         </div>`
               })
            });"""

content = re.sub(r"const response = await sendSystemEmail\(\s*method: 'POST',[\s\S]*?\}\)\s*\}\);", replacement, content)

with open("App.tsx", "w") as f:
    f.write(content)
