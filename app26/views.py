from django.shortcuts import render

# Create your views here.
def index(request):
    a= {'nom_utilisateur': 'Visiteur'}
    return render(request, 'index.html', a)