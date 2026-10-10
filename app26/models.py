from django.db import models


class Formation(models.Model):
    titre = models.CharField(max_length=200)
    description = models.TextField()
    date_creation = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.titre


#from django.db import models

# Create your models here.
