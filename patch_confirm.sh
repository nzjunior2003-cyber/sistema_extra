sed -i -e '/const confirmFirstAccess = () => {/c\
  const confirmFirstAccess = async () => {\
    if (!firstAccessData.email || !firstAccessData.novaSenha || !firstAccessData.nomeGuerra) {\
       alert("Preencha e-mail, nome de guerra e nova senha."); return;\
    }\
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;\
    if (!emailRegex.test(firstAccessData.email)) {\
        alert("O formato do e-mail é inválido. Verifique se não há espaços ou erros de digitação."); return;\
    }\
    try {\
        const res = await fetch("/api/validate-email", {\
            method: "POST",\
            headers: { "Content-Type": "application/json" },\
            body: JSON.stringify({ email: firstAccessData.email })\
        });\
        const data = await res.json();\
        if (!data.valid) {\
            alert(`E-mail rejeitado pelo servidor: ${data.error}`); return;\
        }\
    } catch (e) {\
        console.error("Erro na validação do e-mail:", e);\
        alert("Não foi possível validar o domínio do e-mail no servidor (pode estar offline). Tente novamente mais tarde."); return;\
    }\
' App.tsx
