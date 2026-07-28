with open('App.tsx', 'r') as f:
    content = f.read()

import_statement = "import { CBMPA_LOGO_BASE64, DEFESA_CIVIL_LOGO_BASE64 } from './utils/logoBase64';\n"
if 'CBMPA_LOGO_BASE64' not in content:
    content = content.replace("import { StatDashboard } from './components/StatDashboard';", "import { StatDashboard } from './components/StatDashboard';\n" + import_statement)

# Replace login screen logo and title
old_login_logo = '''<Flame size={48} className="text-yellow-500 mb-2" />
            <h1 className="text-3xl font-black text-cbmpa-900 dark:text-white tracking-wider">EXTRA DOCS</h1>'''
new_login_logo = '''<div className="flex items-center gap-4 mb-4">
              <img src={CBMPA_LOGO_BASE64} alt="Brasão CBMPA" className="w-16 h-16 object-contain" />
              <img src={DEFESA_CIVIL_LOGO_BASE64} alt="Brasão CEDEC" className="w-16 h-16 object-contain" />
            </div>
            <h1 className="text-3xl font-black text-cbmpa-900 dark:text-white tracking-wider text-center">SIGDOC</h1>'''
content = content.replace(old_login_logo, new_login_logo)

# Replace sidebar logo and title
old_sidebar_logo = '''<Flame size={24} className="text-yellow-500" />
            <h1 className="font-bold text-xl tracking-wider">EXTRA DOCS</h1>'''
new_sidebar_logo = '''<div className="flex items-center gap-2">
              <img src={CBMPA_LOGO_BASE64} alt="CBMPA" className="w-8 h-8 object-contain" />
              <img src={DEFESA_CIVIL_LOGO_BASE64} alt="CEDEC" className="w-8 h-8 object-contain" />
            </div>
            <h1 className="font-bold text-xl tracking-wider">SIGDOC</h1>'''
content = content.replace(old_sidebar_logo, new_sidebar_logo)

with open('App.tsx', 'w') as f:
    f.write(content)

