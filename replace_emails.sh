sed -i 's/await fetch('\''\/api\/send-email'\'', {/await sendSystemEmail(/' App.tsx
sed -i '233,243c\
       await sendSystemEmail(\
           "sipcdal@gmail.com",\
           `Nova Solicitação de Perfil: ${role}${ubm ? ` (${ubm})` : ""}`,\
           `<div style="font-family: sans-serif; padding: 20px;">\\\n                       <h2>Sistema de Escalas - Solicitação de Acesso</h2>\\\n                       <p>O militar <strong>${currentUser.nome}</strong> (Matrícula: ${currentUser.matricula}) solicitou acesso ao perfil: <strong>${role}</strong>${ubm ? ` para a UBM: <strong>${ubm}</strong>` : ""}.</p>\\\n                       <p>Acesse o painel de Administração no sistema para aprovar ou recusar a solicitação.</p>\\\n                      </div>`\
       );\
' App.tsx
