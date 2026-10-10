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
import base64
from io import BytesIO

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np

from django.shortcuts import render


def geometrie(request):
    image = None
    erreur = None

    if request.method == "POST":
        try:
            figure = request.POST.get("figure", "triangle")

            x1 = float(request.POST.get("x1", 0))
            y1 = float(request.POST.get("y1", 0))
            x2 = float(request.POST.get("x2", 2))
            y2 = float(request.POST.get("y2", 2))
            x3 = float(request.POST.get("x3", 3))
            y3 = float(request.POST.get("y3", 0))
            rayon = float(request.POST.get("rayon", 1))

            fig, ax = plt.subplots(figsize=(7, 7))

            if figure == "point":
                ax.scatter(x1, y1, color="red")
                ax.annotate("A", (x1, y1))

            elif figure == "segment":
                ax.plot([x1, x2], [y1, y2], "b-o")
                ax.annotate("A", (x1, y1))
                ax.annotate("B", (x2, y2))

            elif figure == "droite":
                t = np.linspace(-10, 10, 400)
                x = x1 + t * (x2 - x1)
                y = y1 + t * (y2 - y1)

                ax.plot(x, y, "b-")
                ax.scatter([x1, x2], [y1, y2], color="red")

            elif figure == "triangle":
                ax.plot(
                    [x1, x2, x3, x1],
                    [y1, y2, y3, y1],
                    "b-o"
                )

                ax.annotate("A", (x1, y1))
                ax.annotate("B", (x2, y2))
                ax.annotate("C", (x3, y3))

            elif figure == "cercle":
                if rayon <= 0:
                    raise ValueError(
                        "Le rayon doit être strictement positif."
                    )

                cercle = plt.Circle(
                    (x1, y1),
                    rayon,
                    fill=False,
                    color="blue"
                )

                ax.add_patch(cercle)
                ax.scatter(x1, y1, color="red")
                ax.annotate("O", (x1, y1))

            else:
                raise ValueError("Figure géométrique inconnue.")

            ax.set_xlim(-10, 10)
            ax.set_ylim(-10, 10)
            ax.set_aspect("equal")
            ax.grid(True)
            ax.axhline(0, color="black", linewidth=0.7)
            ax.axvline(0, color="black", linewidth=0.7)

            buffer = BytesIO()
            fig.savefig(
                buffer,
                format="png",
                bbox_inches="tight"
            )
            plt.close(fig)

            buffer.seek(0)

            image = base64.b64encode(
                buffer.getvalue()
            ).decode("utf-8")

            buffer.close()

        except (ValueError, TypeError) as exc:
            erreur = str(exc)

    return render(
        request,
        "geometrie.html",
        {
            "image": image,
            "erreur": erreur,
        }
    )