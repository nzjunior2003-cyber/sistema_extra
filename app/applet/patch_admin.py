import re

with open('App.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. State: adminUserSearch
old_state = """  const [roleRequests, setRoleRequests] = useState<any[]>(() => {
    const saved = localStorage.getItem('ROLE_REQUESTS');
    return saved ? JSON.parse(saved) : [];
  });"""

new_state = """  const [roleRequests, setRoleRequests] = useState<any[]>(() => {
    const saved = localStorage.getItem('ROLE_REQUESTS');
    return saved ? JSON.parse(saved) : [];
  });
  const [adminUserSearch, setAdminUserSearch] = useState('');"""

if old_state in code:
    code = code.replace(old_state, new_state, 1)
    print("1. adminUserSearch state added")
else:
    print("1. WARNING: old_state not found")

# 2. useEffect for currentUser auto-switch activeTab for ADMIN
old_effect = """  useEffect(() => {
    // Force fix for existing cached 'administrador' who lost ADMIN tag
     if (currentUser && currentUser.matricula === 'administrador' && !currentUser.permissoes?.includes('ADMIN')) {
         const updatedUser = { ...currentUser, permissoes: ['ADMIN', 'ESCALANTE', 'APROVADOR', 'PAGAMENTO'] };
         setCurrentUser(updatedUser);
         saveCustomUser(updatedUser.matricula, updatedUser);
     }
  }, [currentUser]);"""

new_effect = """  useEffect(() => {
    // Force fix for existing cached 'administrador' who lost ADMIN tag
     if (currentUser && currentUser.matricula === 'administrador' && !currentUser.permissoes?.includes('ADMIN')) {
         const updatedUser = { ...currentUser, permissoes: ['ADMIN', 'ESCALANTE', 'APROVADOR', 'PAGAMENTO'] };
         setCurrentUser(updatedUser);
         saveCustomUser(updatedUser.matricula, updatedUser);
     }
     if (currentUser && (currentUser.permissoes || []).includes('ADMIN') && activeTab !== 'ADMIN') {
         setActiveTab('ADMIN');
     }
  }, [currentUser]);"""

if old_effect in code:
    code = code.replace(old_effect, new_effect, 1)
    print("2. useEffect updated")
else:
    print("2. WARNING: old_effect not found")

# 3. User management helper functions (handleRemoveRole, handleDeleteUser, handleClearRequests)
old_remove_role = """   const handleRemoveRole = (matricula: string, role: string) => {
      if (matricula === 'administrador' && role === 'ADMIN') {
          alert("Não é possível remover a permissão ADMIN do administrador padrão.");
          return;
      }

      if (window.confirm(`Deseja realmente remover a permissão de ${role} do usuário?`)) {
          const currentDict = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
          let userToUpdate = currentDict[matricula];
          if (userToUpdate) {
              userToUpdate.permissoes = (userToUpdate.permissoes || []).filter((p: string) => p !== role);
              currentDict[matricula] = userToUpdate;
              localStorage.setItem('CUSTOM_USERS_DB', JSON.stringify(currentDict));
              setCustomUsersDict(currentDict);

              if (currentUser && currentUser.matricula === matricula) {
                  setCurrentUser(userToUpdate);
              }
          }
      }
   };"""

new_remove_role = """   const handleRemoveRole = (matricula: string, role: string) => {
      if (matricula === 'administrador' && role === 'ADMIN') {
          alert("Não é possível remover a permissão ADMIN do administrador padrão.");
          return;
      }

      if (window.confirm(`Deseja realmente remover a permissão de ${role} do usuário de matrícula ${matricula}?`)) {
          const currentDict = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
          let userToUpdate = currentDict[matricula];
          if (!userToUpdate) {
              const mock = MOCK_USERS.find(u => u.matricula === matricula);
              if (mock) {
                  userToUpdate = { ...mock };
              }
          }
          if (userToUpdate) {
              userToUpdate.permissoes = (userToUpdate.permissoes || []).filter((p: string) => p !== role);
              currentDict[matricula] = userToUpdate;
              localStorage.setItem('CUSTOM_USERS_DB', JSON.stringify(currentDict));
              setCustomUsersDict({ ...currentDict });

              if (currentUser && currentUser.matricula === matricula) {
                  setCurrentUser({ ...userToUpdate });
              }
          }
      }
   };

   const handleDeleteUser = (matricula: string) => {
      if (matricula === 'administrador') {
          alert("Não é possível excluir o usuário administrador padrão.");
          return;
      }

      if (window.confirm(`Deseja realmente excluir permanentemente o usuário de matrícula ${matricula}? Todos os acessos e cadastros deste usuário serão removidos do sistema.`)) {
          const currentDict = JSON.parse(localStorage.getItem('CUSTOM_USERS_DB') || '{}');
          delete currentDict[matricula];
          localStorage.setItem('CUSTOM_USERS_DB', JSON.stringify(currentDict));
          setCustomUsersDict({ ...currentDict });

          const currentReqs = JSON.parse(localStorage.getItem('ROLE_REQUESTS') || '[]');
          const newReqs = currentReqs.filter((r: any) => r.matricula !== matricula);
          localStorage.setItem('ROLE_REQUESTS', JSON.stringify(newReqs));
          setRoleRequests(newReqs);

          if (currentUser && currentUser.matricula === matricula) {
              setCurrentUser(null);
          }

          alert(`Usuário de matrícula ${matricula} foi excluído com sucesso.`);
      }
   };

   const handleClearRequests = () => {
      if (window.confirm("Deseja realmente limpar todas as solicitações de acesso?")) {
          localStorage.removeItem('ROLE_REQUESTS');
          setRoleRequests([]);
          alert("Todas as solicitações de acesso foram limpas com sucesso.");
      }
   };"""

if old_remove_role in code:
    code = code.replace(old_remove_role, new_remove_role, 1)
    print("3. handleRemoveRole & handleDeleteUser updated")
else:
    print("3. WARNING: old_remove_role not found")

# 4. handleLogin and confirmFirstAccess activeTab setting
old_login_tab = """          setCurrentUser(foundUser);
          setActiveTab('PORTAL');"""

new_login_tab = """          setCurrentUser(foundUser);
          setActiveTab((foundUser?.permissoes || []).includes('ADMIN') ? 'ADMIN' : 'PORTAL');"""

if old_login_tab in code:
    code = code.replace(old_login_tab, new_login_tab, 1)
    print("4a. handleLogin activeTab updated")
else:
    print("4a. WARNING: old_login_tab not found")

old_first_tab = """     setCurrentUser(finalUser);
     setActiveTab('PORTAL');"""

new_first_tab = """     setCurrentUser(finalUser);
     setActiveTab((finalUser?.permissoes || []).includes('ADMIN') ? 'ADMIN' : 'PORTAL');"""

if old_first_tab in code:
    code = code.replace(old_first_tab, new_first_tab, 1)
    print("4b. confirmFirstAccess activeTab updated")
else:
    print("4b. WARNING: old_first_tab not found")

# 5. Sidebar Navigation
old_sidebar = """        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          <button onClick={() => setActiveTab('PORTAL')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'PORTAL' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
            <LayoutDashboard size={20} /><span>Meu Portal</span>
          </button>

          <button onClick={() => setActiveTab('SOLICITAR_PERFIL')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'SOLICITAR_PERFIL' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
            <UserPlus size={20} /><span>Solicitar Perfil</span>
          </button>

          {(currentUser?.permissoes || []).includes('ESCALANTE') && (
            <button onClick={() => setActiveTab('ESCALANTE')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'ESCALANTE' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
              <Plus size={20} /><span>Criar Escala</span>
            </button>
          )}

          {escalas.some(e => (e.comandanteMatricula === currentUser.matricula || e.auxiliarMatricula === currentUser.matricula) && (e.status === 'em_edicao' || e.status === 'esclarecimento_solicitado')) && (
            <button onClick={() => setActiveTab('COMANDANTE')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'COMANDANTE' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
              <ClipboardList size={20} /><span>Atestar Missões</span><span className="bg-red-500 text-white text-xs px-2 rounded-full">!</span>
            </button>
          )}

          {((currentUser?.permissoes || []).includes('APROVADOR') || escalas.some(e => e.homologadorMatricula === currentUser.matricula && e.status === 'atestado')) && (
            <button onClick={() => setActiveTab('APROVADOR')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'APROVADOR' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
              <ShieldCheck size={20} /><span>Homologação</span>
            </button>
          )}

          {(currentUser?.permissoes || []).includes('PAGAMENTO') && (
            <button onClick={() => setActiveTab('PAGAMENTO')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'PAGAMENTO' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
              <Banknote size={20} /><span>Lançamento</span>
            </button>
          )}

          {(currentUser?.permissoes || []).includes('ADMIN') && (
            <button onClick={() => setActiveTab('ADMIN')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'ADMIN' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
              <User size={20} /><span>Administração</span>
              {roleRequests.filter((r:any) => r.status === 'PENDING').length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full ml-auto">{roleRequests.filter((r:any) => r.status === 'PENDING').length}</span>}
            </button>
          )}
        </nav>"""

new_sidebar = """        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {(currentUser?.permissoes || []).includes('ADMIN') ? (
            <button onClick={() => setActiveTab('ADMIN')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'ADMIN' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
              <User size={20} /><span>Administração</span>
              {roleRequests.filter((r:any) => r.status === 'PENDING').length > 0 && <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full ml-auto">{roleRequests.filter((r:any) => r.status === 'PENDING').length}</span>}
            </button>
          ) : (
            <>
              <button onClick={() => setActiveTab('PORTAL')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'PORTAL' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                <LayoutDashboard size={20} /><span>Meu Portal</span>
              </button>

              <button onClick={() => setActiveTab('SOLICITAR_PERFIL')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'SOLICITAR_PERFIL' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                <UserPlus size={20} /><span>Solicitar Perfil</span>
              </button>

              {(currentUser?.permissoes || []).includes('ESCALANTE') && (
                <button onClick={() => setActiveTab('ESCALANTE')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'ESCALANTE' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <Plus size={20} /><span>Criar Escala</span>
                </button>
              )}

              {escalas.some(e => (e.comandanteMatricula === currentUser.matricula || e.auxiliarMatricula === currentUser.matricula) && (e.status === 'em_edicao' || e.status === 'esclarecimento_solicitado')) && (
                <button onClick={() => setActiveTab('COMANDANTE')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'COMANDANTE' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <ClipboardList size={20} /><span>Atestar Missões</span><span className="bg-red-500 text-white text-xs px-2 rounded-full">!</span>
                </button>
              )}

              {((currentUser?.permissoes || []).includes('APROVADOR') || escalas.some(e => e.homologadorMatricula === currentUser.matricula && e.status === 'atestado')) && (
                <button onClick={() => setActiveTab('APROVADOR')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'APROVADOR' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <ShieldCheck size={20} /><span>Homologação</span>
                </button>
              )}

              {(currentUser?.permissoes || []).includes('PAGAMENTO') && (
                <button onClick={() => setActiveTab('PAGAMENTO')} className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all ${activeTab === 'PAGAMENTO' ? 'bg-yellow-500 text-cbmpa-900 font-bold' : 'hover:bg-cbmpa-800 text-white'}`}>
                  <Banknote size={20} /><span>Lançamento</span>
                </button>
              )}
            </>
          )}
        </nav>"""

if old_sidebar in code:
    code = code.replace(old_sidebar, new_sidebar, 1)
    print("5. Sidebar navigation updated")
else:
    print("5. WARNING: old_sidebar not found")

# 6. Remove old ADMIN section from PORTAL tab
old_portal_admin = """                {/* VISÃO EXCLUSIVA DE ADMIN: LISTA DE USUÁRIOS APROVADOS */}
                {(currentUser?.permissoes || []).includes('ADMIN') && (
                  <div className="mt-8 border-t pt-6 border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold mb-4 font-sans text-cbmpa-900 dark:text-white">Usuários com Perfis de Acesso</h3>
                    <div className="space-y-4">
                       {['ESCALANTE', 'APROVADOR', 'PAGAMENTO'].map(roleName => {
                           // Find users in customUsersDict who have this role
                           const usersWithRole = Object.values(customUsersDict).filter((u: any) => (u.permissoes || []).includes(roleName));
                           return (
                               <div key={roleName} className="border rounded-lg p-4 bg-white dark:bg-gray-800">
                                   <div className="font-bold text-cbmpa-900 mb-3 flex items-center gap-2">
                                     {roleName === 'ESCALANTE' ? <Plus size={16}/> : roleName === 'APROVADOR' ? <ShieldCheck size={16}/> : <Banknote size={16}/>}
                                     Perfil: {roleName} ({usersWithRole.length})
                                   </div>
                                   {usersWithRole.length === 0 ? (
                                      <p className="text-sm text-gray-500 italic">Nenhum usuário com este perfil.</p>
                                   ) : (
                                      <div className="space-y-2">
                                        {usersWithRole.map((u: any) => (
                                           <div key={u.matricula} className="flex justify-between items-center text-sm border-b border-gray-100 last:border-0 pb-2 last:pb-0">
                                              <div>
                                                <span className="font-bold">{u.nome}</span> <span className="text-gray-500">({u.matricula})</span>
                                                {roleName === 'ESCALANTE' && u.ubmEscalante && (
                                                   <span className="ml-2 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-[10px] font-bold rounded">
                                                      {u.ubmEscalante}
                                                   </span>
                                                )}
                                              </div>
                                              <button onClick={() => handleRemoveRole(u.matricula, roleName)} className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded border border-red-200 hover:bg-red-50 transition-colors">
                                                 Remover Permissão
                                              </button>
                                           </div>
                                        ))}
                                      </div>
                                   )}
                               </div>
                           );
                       })}
                    </div>
                  </div>
                )}"""

if old_portal_admin in code:
    code = code.replace(old_portal_admin, '', 1)
    print("6. PORTAL old ADMIN section removed")
else:
    print("6. WARNING: old_portal_admin not found")

# 7. Comprehensive ADMIN View
old_admin_view = """            {activeTab === 'ADMIN' && (
              <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-2xl font-bold flex items-center gap-2"><User /> Administração de Usuários</h2>
                  <button type="button" onClick={(e) => { e.preventDefault(); localStorage.removeItem('ROLE_REQUESTS'); setRoleRequests([]); }} className="text-xs border text-red-600 border-red-600 hover:bg-red-50 px-3 py-1 rounded">Limpar Solicitações</button>
                </div>
                
                <h3 className="text-lg font-bold mb-4 font-sans text-cbmpa-900 dark:text-white">Solicitações de Acesso Pendentes</h3>
                <div className="space-y-3">
                  {roleRequests.filter((r:any) => r.status === 'PENDING').map(req => (
                    <div key={req.id} className="p-4 border rounded-lg flex justify-between items-center bg-gray-50 dark:bg-gray-900/50">
                      <div>
                        <div className="font-bold">{req.nome || 'Usuário'} (Mat: {req.matricula})</div>
                        <div className="text-sm text-gray-500">
                          Solicitou perfil: <span className="font-bold text-cbmpa-700 dark:text-yellow-500">{req.role}</span>
                          {req.ubm && <> para a UBM: <span className="font-bold text-blue-700 dark:text-blue-400">{req.ubm}</span></>}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => handleApproveRole(req.id, false)} className="px-3 py-1 border border-red-500 text-red-600 rounded hover:bg-red-50 font-bold text-sm">Recusar</button>
                        <button onClick={() => handleApproveRole(req.id, true)} className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 font-bold text-sm">Aprovar</button>
                      </div>
                    </div>
                  ))}
                  {roleRequests.filter((r:any) => r.status === 'PENDING').length === 0 && <p className="text-gray-500 italic">Nenhuma solicitação pendente.</p>}
                </div>
              </div>
            )}"""

new_admin_view = """            {activeTab === 'ADMIN' && (() => {
              const allRegisteredUsersMap: Record<string, any> = {};
              MOCK_USERS.forEach(m => { allRegisteredUsersMap[m.matricula] = { ...m }; });
              Object.keys(customUsersDict).forEach(mat => {
                allRegisteredUsersMap[mat] = { ...allRegisteredUsersMap[mat], ...customUsersDict[mat] };
              });
              const allRegisteredUsers = Object.values(allRegisteredUsersMap);
              const filteredAllUsers = allRegisteredUsers.filter((u: any) => {
                if (!adminUserSearch.trim()) return true;
                const q = adminUserSearch.toLowerCase().trim();
                return (
                  (u.nome || '').toLowerCase().includes(q) ||
                  (u.matricula || '').toLowerCase().includes(q) ||
                  (u.email || '').toLowerCase().includes(q) ||
                  (u.posto || '').toLowerCase().includes(q)
                );
              });

              return (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                      <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2 text-cbmpa-900 dark:text-white">
                          <User className="text-cbmpa-700 dark:text-yellow-500" /> Administração de Usuários
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          Gerenciamento centralizado de solicitações pendentes, perfis de acesso ativos e exclusão de contas.
                        </p>
                      </div>
                      <button 
                        type="button" 
                        onClick={handleClearRequests} 
                        className="text-xs border border-red-500 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 transition"
                      >
                        <Trash2 size={14} /> Limpar Solicitações
                      </button>
                    </div>

                    {/* SEÇÃO 1: SOLICITAÇÕES PENDENTES */}
                    <div className="mb-8">
                      <h3 className="text-lg font-bold mb-4 font-sans text-cbmpa-900 dark:text-white flex items-center gap-2">
                        <UserPlus size={18} className="text-yellow-500" /> Solicitações de Acesso Pendentes
                        {roleRequests.filter((r:any) => r.status === 'PENDING').length > 0 && (
                          <span className="bg-red-500 text-white text-xs px-2 py-0.5 rounded-full font-bold">
                            {roleRequests.filter((r:any) => r.status === 'PENDING').length}
                          </span>
                        )}
                      </h3>
                      <div className="space-y-3">
                        {roleRequests.filter((r:any) => r.status === 'PENDING').map(req => (
                          <div key={req.id} className="p-4 border rounded-xl flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-gray-50 dark:bg-gray-900/50 border-gray-200 dark:border-gray-700">
                            <div>
                              <div className="font-bold text-gray-900 dark:text-white">{req.nome || 'Usuário'} (Mat: {req.matricula})</div>
                              <div className="text-sm text-gray-600 dark:text-gray-400 mt-0.5">
                                Solicitou perfil: <span className="font-bold text-cbmpa-700 dark:text-yellow-500">{req.role}</span>
                                {req.ubm && <> para a UBM: <span className="font-bold text-blue-700 dark:text-blue-400">{req.ubm}</span></>}
                              </div>
                            </div>
                            <div className="flex gap-2 w-full sm:w-auto justify-end">
                              <button onClick={() => handleApproveRole(req.id, false)} className="px-3 py-1.5 border border-red-500 text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 font-bold text-xs transition">Recusar</button>
                              <button onClick={() => handleApproveRole(req.id, true)} className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 font-bold text-xs transition">Aprovar</button>
                            </div>
                          </div>
                        ))}
                        {roleRequests.filter((r:any) => r.status === 'PENDING').length === 0 && (
                          <div className="p-4 border rounded-xl bg-gray-50 dark:bg-gray-900/30 text-gray-500 italic text-sm text-center">
                            Nenhuma solicitação pendente no momento.
                          </div>
                        )}
                      </div>
                    </div>

                    {/* SEÇÃO 2: PERFIS DE ACESSO ATIVOS */}
                    <div className="mb-8 border-t pt-6 border-gray-200 dark:border-gray-700">
                      <h3 className="text-lg font-bold mb-4 font-sans text-cbmpa-900 dark:text-white flex items-center gap-2">
                        <ShieldCheck size={18} className="text-green-600" /> Perfis de Acesso Ativos
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {['ESCALANTE', 'APROVADOR', 'PAGAMENTO'].map(roleName => {
                          const usersWithRole = allRegisteredUsers.filter((u: any) => (u.permissoes || []).includes(roleName));
                          return (
                            <div key={roleName} className="border rounded-xl p-4 bg-gray-50/50 dark:bg-gray-900/40 border-gray-200 dark:border-gray-700 flex flex-col justify-between">
                              <div>
                                <div className="font-bold text-cbmpa-900 dark:text-yellow-400 mb-3 flex items-center gap-2 pb-2 border-b border-gray-200 dark:border-gray-700">
                                  {roleName === 'ESCALANTE' ? <Plus size={16}/> : roleName === 'APROVADOR' ? <ShieldCheck size={16}/> : <Banknote size={16}/>}
                                  Perfil: {roleName} ({usersWithRole.length})
                                </div>
                                {usersWithRole.length === 0 ? (
                                  <p className="text-xs text-gray-500 italic py-2">Nenhum usuário com este perfil.</p>
                                ) : (
                                  <div className="space-y-3">
                                    {usersWithRole.map((u: any) => (
                                      <div key={u.matricula} className="flex flex-col gap-2 p-2.5 rounded-lg bg-white dark:bg-gray-800 border border-gray-100 dark:border-gray-750 text-xs">
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <span className="font-bold text-gray-900 dark:text-white">{u.nome || u.matricula}</span>
                                            <div className="text-gray-500 text-[11px]">Matrícula: {u.matricula}</div>
                                            {roleName === 'ESCALANTE' && u.ubmEscalante && (
                                              <span className="inline-block mt-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 text-[10px] font-bold rounded">
                                                {u.ubmEscalante}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                        <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                                          <button 
                                            onClick={() => handleRemoveRole(u.matricula, roleName)} 
                                            className="flex-1 py-1 px-2 text-[11px] text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 dark:border-red-900/50 dark:hover:bg-red-950/40 rounded-md font-bold transition text-center"
                                            title="Remover acesso a este perfil"
                                          >
                                            Remover Acesso
                                          </button>
                                          {u.matricula !== 'administrador' && (
                                            <button 
                                              onClick={() => handleDeleteUser(u.matricula)} 
                                              className="py-1 px-2 text-[11px] text-white bg-red-600 hover:bg-red-700 rounded-md font-bold transition text-center"
                                              title="Excluir o usuário completamente"
                                            >
                                              Excluir Usuário
                                            </button>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* SEÇÃO 3: TODOS OS USUÁRIOS CADASTRADOS */}
                    <div className="border-t pt-6 border-gray-200 dark:border-gray-700">
                      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                        <h3 className="text-lg font-bold font-sans text-cbmpa-900 dark:text-white flex items-center gap-2">
                          <Users size={18} className="text-blue-600" /> Todos os Usuários Cadastrados ({allRegisteredUsers.length})
                        </h3>
                        <div className="relative w-full sm:w-64">
                          <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                          <input 
                            type="text" 
                            placeholder="Pesquisar por nome ou matrícula..." 
                            value={adminUserSearch}
                            onChange={(e) => setAdminUserSearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 text-xs border rounded-lg bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-cbmpa-700"
                          />
                        </div>
                      </div>

                      <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                        <table className="w-full text-left text-xs text-gray-700 dark:text-gray-300">
                          <thead className="bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200 font-bold uppercase text-[10px]">
                            <tr>
                              <th className="p-3">Usuário / Matrícula</th>
                              <th className="p-3">Posto / E-mail</th>
                              <th className="p-3">Perfis / Permissões</th>
                              <th className="p-3 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 dark:divide-gray-700 bg-white dark:bg-gray-800">
                            {filteredAllUsers.map((u: any) => {
                              const permissoes = u.permissoes || [];
                              return (
                                <tr key={u.matricula} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition">
                                  <td className="p-3">
                                    <div className="font-bold text-gray-900 dark:text-white">{u.nome || 'Sem Nome'}</div>
                                    <div className="text-gray-500 text-[11px]">Matrícula: <span className="font-mono">{u.matricula}</span></div>
                                  </td>
                                  <td className="p-3">
                                    <div>{u.posto || 'Não informado'}</div>
                                    <div className="text-gray-400 text-[11px]">{u.email || 'Sem e-mail'}</div>
                                  </td>
                                  <td className="p-3">
                                    {permissoes.length > 0 ? (
                                      <div className="flex flex-wrap gap-1">
                                        {permissoes.map((p: string) => (
                                          <span key={p} className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 rounded font-bold text-[10px]">
                                            {p}
                                          </span>
                                        ))}
                                      </div>
                                    ) : (
                                      <span className="text-gray-400 italic text-[11px]">Sem perfis especiais</span>
                                    )}
                                  </td>
                                  <td className="p-3 text-right">
                                    <div className="flex justify-end gap-2">
                                      {u.matricula !== 'administrador' ? (
                                        <button 
                                          onClick={() => handleDeleteUser(u.matricula)}
                                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold text-xs transition flex items-center gap-1"
                                          title="Excluir este usuário do sistema"
                                        >
                                          <Trash2 size={13} /> Excluir Usuário
                                        </button>
                                      ) : (
                                        <span className="text-[10px] text-gray-400 italic px-2 py-1">Conta Administrador Padrão</span>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                            {filteredAllUsers.length === 0 && (
                              <tr>
                                <td colSpan={4} className="p-4 text-center text-gray-500 italic">
                                  Nenhum usuário encontrado na busca.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}"""

if old_admin_view in code:
    code = code.replace(old_admin_view, new_admin_view, 1)
    print("7. Comprehensive ADMIN view replaced")
else:
    print("7. WARNING: old_admin_view not found")

with open('App.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Done patching App.tsx")
