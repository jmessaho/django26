from django.shortcuts import render

# Create your views here.
def index(request):
    a= {'myname': 'J. Messaho'}
    return render(request, 'index.html', a)