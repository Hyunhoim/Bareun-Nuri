document.querySelectorAll('template.comment-template').forEach(template=>{
  setTimeout(()=>template.replaceWith(template.content.cloneNode(true)),Number(template.dataset.delay));
});
