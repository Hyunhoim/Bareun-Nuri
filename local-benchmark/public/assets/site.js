document.querySelectorAll('.comment-template').forEach(template => {
  setTimeout(() => {
    template.previousElementSibling.append(template.content.cloneNode(true));
    template.remove();
  }, 150);
});
