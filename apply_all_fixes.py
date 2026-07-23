import sys

with open('App.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add getEffectiveCostItems definition if missing
if 'const getEffectiveCostItems' not in code:
    target_state = "const [editingEscalaId, setEditingEscalaId] = useState<string | null>(null);"
    replacement_state = target_state + """
  const getEffectiveCostItems = (formData: any) => {
    if (!formData) return [];
    if (Array.isArray(formData.costSheetItems)) {
      return formData.costSheetItems;
    }
    return [];
  };"""
    code = code.replace(target_state, replacement_state, 1)

# 2. Rename Labels in COST_SHEET
code = code.replace("HOMOLOGADOR (APROVADOR FINAL)", "DESTINATÁRIO (HOMOLOGADOR)")
code = code.replace("DESTINATÁRIO (EX: CMDO GERAL)", "FUNÇÃO DO DESTINATÁRIO")

# 3. Fix duplicate action bar (move REPORT action bar inside REPORT condition)
old_report_end = """                     </div>
                  </div>
                )}

                                     {/* Botões de Ação do Relatório */}"""

new_report_end = """                     </div>

                                     {/* Botões de Ação do Relatório */}"""

code = code.replace(old_report_end, new_report_end, 1)

old_actions_end = """                             return null;
                           })()}
                        </div>
                     </div>

{/* --- SEÇÃO DE RASTREABILIDADE / ASSINATURAS DO SISTEMA --- */}"""

new_actions_end = """                             return null;
                           })()}
                        </div>
                     </div>
                  </div>
                )}

{/* --- SEÇÃO DE RASTREABILIDADE / ASSINATURAS DO SISTEMA --- */}"""

code = code.replace(old_actions_end, new_actions_end, 1)

# 4. Password visibility & Confirm password in Login / Modal
# Add state for eye toggles
if 'const [showLoginPassword, setShowLoginPassword]' not in code:
    code = code.replace(
        "const [loginData, setLoginData] = useState({ matricula: '', senha: '' });",
        "const [loginData, setLoginData] = useState({ matricula: '', senha: '' });\n  const [showLoginPassword, setShowLoginPassword] = useState(false);\n  const [showNewPassword, setShowNewPassword] = useState(false);\n  const [showConfirmPassword, setShowConfirmPassword] = useState(false);"
    )

# Update firstAccessData state to include confirmarSenha
code = code.replace(
    "const [firstAccessData, setFirstAccessData] = useState({ email: '', novaSenha: '', nomeGuerra: '' });",
    "const [firstAccessData, setFirstAccessData] = useState({ email: '', novaSenha: '', confirmarSenha: '', nomeGuerra: '' });"
)

# Update confirmFirstAccess handler to check confirm password
old_confirm_access = """    if (!firstAccessData.email || !firstAccessData.novaSenha || !firstAccessData.nomeGuerra) {
      alert("Preencha e-mail, nome de guerra e nova senha."); return;
    }"""
new_confirm_access = """    if (!firstAccessData.email || !firstAccessData.novaSenha || !firstAccessData.confirmarSenha || !firstAccessData.nomeGuerra) {
      alert("Preencha e-mail, nome de guerra, nova senha e confirmação de senha."); return;
    }
    if (firstAccessData.novaSenha !== firstAccessData.confirmarSenha) {
      alert("A nova senha e a confirmação de senha não coincidem."); return;
    }"""
code = code.replace(old_confirm_access, new_confirm_access, 1)

# Login password input with Eye/EyeOff toggle
old_login_pwd_input = """              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input type="password" required className="w-full pl-10 pr-3 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={loginData.senha} onChange={e => setLoginData({...loginData, senha: e.target.value})} />
                </div>
              </div>"""

new_login_pwd_input = """              <div>
                <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 text-gray-400" size={18} />
                  <input type={showLoginPassword ? "text" : "password"} required className="w-full pl-10 pr-10 py-2 border rounded-md dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={loginData.senha} onChange={e => setLoginData({...loginData, senha: e.target.value})} />
                  <button type="button" onClick={() => setShowLoginPassword(!showLoginPassword)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    {showLoginPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>"""
code = code.replace(old_login_pwd_input, new_login_pwd_input, 1)

# Modal Nova Senha & Confirmar Senha inputs
old_modal_pwd_input = """                   <div>
                      <label className="block text-sm font-bold text-gray-700 mb-1">Nova Senha</label>
                      <input type="password" required className="w-full p-2 border rounded dark:bg-gray-700 dark:border-gray-600" value={firstAccessData.novaSenha} onChange={e => setFirstAccessData({...firstAccessData, novaSenha: e.target.value})} />
                   </div>"""

new_modal_pwd_input = """                   <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Nova Senha</label>
                      <div className="relative">
                        <input type={showNewPassword ? "text" : "password"} required className="w-full p-2 pr-10 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={firstAccessData.novaSenha} onChange={e => setFirstAccessData({...firstAccessData, novaSenha: e.target.value})} />
                        <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                   </div>
                   <div>
                      <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1">Confirmar Nova Senha</label>
                      <div className="relative">
                        <input type={showConfirmPassword ? "text" : "password"} required className="w-full p-2 pr-10 border rounded dark:bg-gray-700 dark:border-gray-600 dark:text-white" value={firstAccessData.confirmarSenha || ''} onChange={e => setFirstAccessData({...firstAccessData, confirmarSenha: e.target.value})} />
                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-3 top-2.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                          {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                   </div>"""
code = code.replace(old_modal_pwd_input, new_modal_pwd_input, 1)

# 5. Fix consultingEscalaId modal cutoff at top
old_modal_consult = """<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl w-full max-w-4xl shadow-2xl border border-gray-200 dark:border-gray-700 my-8">"""

new_modal_consult = """<div className="fixed inset-0 z-50 overflow-y-auto bg-black/60 backdrop-blur-sm p-4 sm:p-6 flex justify-center items-start">
                <div className="bg-white dark:bg-gray-800 p-6 rounded-xl w-full max-w-4xl shadow-2xl border border-gray-200 dark:border-gray-700 my-4 sm:my-8">"""
code = code.replace(old_modal_consult, new_modal_consult, 1)

# 6. Add exclamation mark badge to Homologação sidebar button
old_homolog_btn = """              {((currentUser?.permissoes || []).includes('APROVADOR') || escalas.some(e => e.homologadorMatricula === currentUser.matricula && e.status === 'atestado')) && (
                <button onClick={() => setActiveTab('APROVADOR')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'APROVADOR' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <ShieldCheck size={20} /><span>Homologação</span>
                </button>
              )}"""

new_homolog_btn = """              {((currentUser?.permissoes || []).includes('APROVADOR') || escalas.some(e => e.homologadorMatricula === currentUser.matricula && e.status === 'atestado')) && (
                <button onClick={() => setActiveTab('APROVADOR')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'APROVADOR' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <ShieldCheck size={20} /><span className="flex-1 text-left">Homologação</span>
                  {escalas.some(e => e.status === 'atestado' && (!e.homologadorMatricula || e.homologadorMatricula === currentUser.matricula || (currentUser?.permissoes || []).includes('APROVADOR'))) && (
                    <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">!</span>
                  )}
                </button>
              )}"""
code = code.replace(old_homolog_btn, new_homolog_btn, 1)

with open('App.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print('Script applied successfully!')
