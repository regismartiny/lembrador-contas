document.querySelectorAll('input[name="_csrf"]').forEach(function(el){el.value=document.querySelector('meta[name="csrf-token"]')?.content||''});
