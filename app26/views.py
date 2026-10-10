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
def geometrie(request):
    return render(request, "geometrie.html")