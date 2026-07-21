with open("App.tsx", "r") as f:
    content = f.read()

content = content.replace(
"""     }
     
       await sendSystemEmail(""", 
"""     }
     try {
       await sendSystemEmail(""")

with open("App.tsx", "w") as f:
    f.write(content)

