import re

with open("App.tsx", "r") as f:
    content = f.read()

def replacer(match):
    # This is a bit complex. Let's just fix it manually using a simpler approach for each.
    pass

# We will just write the Python script to replace the specific blocks.
# Block 1: sipcdal@gmail.com
content = re.sub(r"await fetch\('/api/send-email', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application/json' \},\s*body: JSON\.stringify\(\{\s*to: 'sipcdal@gmail\.com',\s*subject: `Nova Solicitação de Perfil: \$\{role\}\$\{ubm \? ` \(\$\{ubm\}\)` : ''\}`,[\s\S]*?\}\)\s*\}\);", 
r"""await sendSystemEmail(
           'sipcdal@gmail.com',
           `Nova Solicitação de Perfil: ${role}${ubm ? ` (${ubm})` : ''}`,
           `<div style="font-family: sans-serif; padding: 20px;">
                       <h2>Sistema de Escalas - Solicitação de Acesso</h2>
                       <p>O militar <strong>${currentUser.nome}</strong> (Matrícula: ${currentUser.matricula}) solicitou acesso ao perfil: <strong>${role}</strong>${ubm ? ` para a UBM: <strong>${ubm}</strong>` : ''}.</p>
                       <p>Acesse o painel de Administração no sistema para aprovar ou recusar a solicitação.</p>
                      </div>`
       );""", content)

# Block 2: userToUpdate.email
content = re.sub(r"await fetch\('/api/send-email', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application/json' \},\s*body: JSON\.stringify\(\{\s*to: userToUpdate\.email,[\s\S]*?\}\)\s*\}\);",
r"""await sendSystemEmail(
                         userToUpdate.email,
                         'Sistema de Escalas - Acesso Aprovado',
                         `<div style="font-family: sans-serif; padding: 20px;">
                                 <h2>Solicitação Aprovada</h2>
                                 <p>Sua solicitação de acesso para o perfil <strong>${req.role}</strong> foi <strong>aprovada</strong> pelo administrador.</p>
                                 <p>Você pode acessar o sistema para usar as suas novas permissões.</p>
                                </div>`
                     );""", content)

# Block 4: cmdUserData.email
content = re.sub(r"await fetch\('/api/send-email', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application/json' \},\s*body: JSON\.stringify\(\{\s*to: cmdUserData\.email,[\s\S]*?\}\)\s*\}\)\.catch\(console\.error\);",
r"""await sendSystemEmail(
          cmdUserData.email,
          'Relatório Aprovado - Sistema de Escalas',
          `<p>O relatório da operação <b>${currentEscala.formData.operationName}</b> foi <b>APROVADO</b> pelo homologador.</p>`
       );""", content)

# Block 5: cmdUser.email
content = re.sub(r"await fetch\('/api/send-email', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application/json' \},\s*body: JSON\.stringify\(\{\s*to: cmdUser\.email,[\s\S]*?\}\)\s*\}\)\.catch\(console\.error\);",
r"""await sendSystemEmail(
          cmdUser.email,
          'Relatório Devolvido para Correção - Sistema de Escalas',
          `<p>O relatório da operação <b>${currentEscala.formData.operationName}</b> foi devolvido para correção.</p><p><b>Motivo:</b> ${returnReason}</p><p>Acesse o sistema para realizar os ajustes necessários.</p>`
       );""", content)

# Block 6: mUser.email
content = re.sub(r"await fetch\('/api/send-email', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application/json' \},\s*body: JSON\.stringify\(\{\s*to: mUser\.email,[\s\S]*?\}\)\s*\}\)\.catch\(e => console\.log\('Mail error', e\)\);",
r"""await sendSystemEmail(
           mUser.email,
           'Aviso de Lançamento de Extraordinária - Pagamento',
           `<p>A extraordinária referente à operação <b>${esc.formData.operationName}</b> foi lançada na sua folha de pagamento.</p><p>Acesse o sistema para conferência no seu painel.</p>`
        );""", content)

# Block 7: homUser.email
content = re.sub(r"await fetch\('/api/send-email', \{\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application/json' \},\s*body: JSON\.stringify\(\{\s*to: homUser\.email,[\s\S]*?\}\)\s*\}\)\.catch\(console\.error\);",
r"""await sendSystemEmail(
                        homUser.email,
                        'Novo Serviço Atestado para Homologação',
                        `<p>O serviço <b>${novaEscala.formData.operationName || novaEscala.formData.eventName}</b> foi atestado pelo Comandante e está aguardando sua homologação.</p>`
                    );""", content)

with open("App.tsx", "w") as f:
    f.write(content)

