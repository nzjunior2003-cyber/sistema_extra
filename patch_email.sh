cat << 'INNER_EOF' > utils/emailHelper.ts
export const sendSystemEmail = async (to: string, subject: string, html: string) => {
    try {
        const res = await fetch('/api/send-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to, subject, html })
        });
        const data = await res.json();
        if (!res.ok || data.error) {
            console.error("Erro no envio do e-mail (bounce ou rejeição):", data.error);
            alert(`Falha no envio de notificação para ${to}. Erro: ${data.error || 'Desconhecido'}. Verifique se o e-mail é válido e ativo.`);
            return false;
        }
        return true;
    } catch (e) {
        console.error("Falha na requisição de e-mail:", e);
        alert(`Erro de conexão ao tentar notificar ${to}. A notificação não foi enviada.`);
        return false;
    }
};
INNER_EOF
