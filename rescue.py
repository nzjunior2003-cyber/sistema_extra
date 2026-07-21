import re

with open("App.tsx", "r") as f:
    lines = f.readlines()

new_lines = []
skip_until = None
for i, line in enumerate(lines):
    if skip_until is not None:
        if skip_until in line:
            skip_until = None
        continue
    
    # Broken pattern 1
    if "await fetch('/api/send-email', {" in line and '"sipcdal@gmail.com",' in lines[min(i+1, len(lines)-1)]:
        new_lines.append("""      await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              to: 'sipcdal@gmail.com',
              subject: `Nova Solicitação de Perfil: ${role}${ubm ? ` (${ubm})` : ""}`,
              html: `<div style="font-family: sans-serif; padding: 20px;">\\n                       <h2>Sistema de Escalas - Solicitação de Acesso</h2>\\n                       <p>O militar <strong>${currentUser.nome}</strong> (Matrícula: ${currentUser.matricula}) solicitou acesso ao perfil: <strong>${role}</strong>${ubm ? ` para a UBM: <strong>${ubm}</strong>` : ""}.</p>\\n                       <p>Acesse o painel de Administração no sistema para aprovar ou recusar a solicitação.</p>\\n                      </div>`
          })
      });\n""")
        skip_until = "</div>`"
        continue

    # Broken pattern 2 (userToUpdate)
    if "await fetch('/api/send-email', {userToUpdate.email" in line:
        new_lines.append("""                    await fetch('/api/send-email', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            to: userToUpdate.email,
                            subject: 'Sistema de Escalas - Acesso Aprovado',
                            html: `<div style="font-family: sans-serif; padding: 20px;">\\n                                     <h2>Solicitação Aprovada</h2>\\n                                     <p>Sua solicitação de acesso para o perfil <strong>${req.role}</strong> foi <strong>aprovada</strong> pelo administrador.</p>\\n                                     <p>Você pode acessar o sistema para usar as suas novas permissões.</p>\\n                                    </div>`
                        })
                    });\n""")
        skip_until = "})"
        continue

    # Broken pattern 3 (cmdUserData)
    if "await fetch('/api/send-email', {cmdUserData.email" in line:
        new_lines.append("""      await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
             to: cmdUserData.email,
             subject: 'Relatório Aprovado - Sistema de Escalas',
             html: `<p>O relatório da operação <b>${currentEscala.formData.operationName}</b> foi <b>APROVADO</b> pelo homologador.</p>`
          })
      }).catch(console.error);\n""")
        skip_until = "})"
        continue

    # Broken pattern 4 (mUser, first instance)
    if "await fetch('/api/send-email', {mUser.email" in line and "Aviso de Lançamento de Extraordinária" in line:
        new_lines.append("""        await fetch('/api/send-email', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify({
               to: mUser.email,
               subject: 'Aviso de Lançamento de Extraordinária - Pagamento',
               html: `<p>A extraordinária referente à operação <b>${esc.formData.operationName}</b> foi lançada na sua folha de pagamento.</p><p>Acesse o sistema para conferência no seu painel.</p>`
           })
        }).catch(e => console.log('Mail error', e));\n""")
        skip_until = "})"
        continue

    # Remove extra '})' if any residue
    if "}).catch(console.error);" in line and skip_until == "})":
        skip_until = None
        continue

    new_lines.append(line)

with open("App.tsx", "w") as f:
    f.writelines(new_lines)

