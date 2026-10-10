import os
import subprocess
import tempfile
import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
from sympy import sympify, latex as sympy_latex
from django.http import FileResponse, HttpResponse
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
def geometrie():
    A = (1, 1)
    B = (5, 1)
    C = (3, 4)

    fig, ax = plt.subplots(figsize=(8, 6))

    # Tracer le triangle
    x = [A[0], B[0], C[0], A[0]]
    y = [A[1], B[1], C[1], A[1]]

    ax.plot(x, y, "b-", linewidth=2)

    # Afficher les sommets
    for nom, point in [
        ("A", A),
        ("B", B),
        ("C", C),
    ]:
        ax.scatter(*point, color="red")
        ax.text(
            point[0] + 0.1,
            point[1] + 0.1,
            nom,
            fontsize=12,
        )

    ax.set_title("Triangle ABC")
    ax.set_xlabel("x")
    ax.set_ylabel("y")

    ax.grid(True)
    ax.set_aspect("equal", adjustable="box")

    buffer = BytesIO()

    fig.savefig(
        buffer,
        format="png",
        bbox_inches="tight",
    )

    plt.close(fig)
    buffer.seek(0)

    return HttpResponse(
        buffer.getvalue(),
        content_type="image/png",
    )