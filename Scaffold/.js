cards().forEach(card => {
card.querySelector(".Document-Fold").addEventListener("click", () =>
    setFold(card, !card.classList.contains("folded")));
});


document.addEventListener("click", function (e) {
}

(function () {
    function Fold_Element(card) {
        card.classList.toggle();
    }
})
