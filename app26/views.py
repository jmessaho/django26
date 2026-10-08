import os
import subprocess
import tempfile
from sympy import sympify, latex as sympy_latex
from django.http import FileResponse
from django.shortcuts import render
from django.utils import timezone
# Create your views here.
def index(request):
    hr1 = timezone.now()
    a= {'myname': 'J. Messaho',
        'now' : hr1}
    return render(request, 'index.html', a)
def formations(request):
    return render(request, 'formations.html')
def recherches(request):
    return render(request, 'recherches.html')
def latex(request):
    return render(request, 'latex.html')
def latex_pdf(request):

    if request.method == "POST":

        latex = request.POST.get("latex", "")

        with tempfile.TemporaryDirectory() as temp_dir:

            tex_file = os.path.join(temp_dir, "document.tex")

            with open(tex_file, "w", encoding="utf-8") as f:
                f.write(latex)

            subprocess.run(
                [
                    "pdflatex",
                    "-interaction=nonstopmode",
                    "-halt-on-error",
                    "document.tex"
                ],
                cwd=temp_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=30
            )

            pdf_file = os.path.join(temp_dir, "document.pdf")

            if os.path.exists(pdf_file):
                response = FileResponse(
                    open(pdf_file, "rb"),
                    content_type="application/pdf"
                )
                response["Content-Disposition"] = (
                    'inline; filename="document.pdf"'
                )
                return response

    return render(request, "latex.html")
def calcul(request):
    resultat = ""
    resultat_latex = ""
    erreur = ""

    if request.method == "POST":
        expression = request.POST.get("expression", "")

        try:
            expr = sympify(expression)
            resultat = str(expr)
            resultat_latex = sympy_latex(expr)

        except Exception as e:
            erreur = f"Expression incorrecte : {e}"

    return render(request, "calcul.html", {
        "resultat": resultat,
        "resultat_latex": resultat_latex,
        "erreur": erreur,
    })