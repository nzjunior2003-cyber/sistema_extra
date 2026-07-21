import re

with open("App.tsx", "r") as f:
    content = f.read()

# For each block:
# await sendSystemEmail(
#     method: 'POST',
#     headers: { 'Content-Type': 'application/json' },
#     body: JSON.stringify({
#         to: ...,
#         subject: ...,
#         html: ...
#     })
# ).catch(...) or }

pattern = re.compile(r"await sendSystemEmail\(\s*method: 'POST',\s*headers: \{ 'Content-Type': 'application/json' \},\s*body: JSON\.stringify\(\{\s*to: (.*?),\s*subject: (.*?),\s*html: ([\s\S]*?)\}\)\s*\)(?:\.catch\([^)]*\))?", re.MULTILINE)

def replacer(match):
    to_val = match.group(1).strip()
    sub_val = match.group(2).strip()
    html_val = match.group(3).strip()
    return f"await sendSystemEmail({to_val}, {sub_val}, {html_val})"

content = pattern.sub(replacer, content)

with open("App.tsx", "w") as f:
    f.write(content)
