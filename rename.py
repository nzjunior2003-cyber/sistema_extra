with open('App.tsx', 'r') as f:
    content = f.read()

content = content.replace('SIGDOC', 'SIGJEx')
content = content.replace('Acesso Corporativo Integrado', 'Gestão de Jornada Extraordinária')

with open('App.tsx', 'w') as f:
    f.write(content)

with open('index.html', 'r') as f:
    html = f.read()

html = html.replace('SIGDOC', 'SIGJEx')

with open('index.html', 'w') as f:
    f.write(html)

with open('metadata.json', 'r') as f:
    meta = f.read()

meta = meta.replace('SIGDOC', 'SIGJEx')
meta = meta.replace('Extra_Docs', 'SIGJEx')

with open('metadata.json', 'w') as f:
    f.write(meta)

