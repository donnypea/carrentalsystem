```javascript
document.addEventListener("DOMContentLoaded", () => {

    const elements = document.querySelectorAll(
        ".about-content, .about-image, .service-card, .destination-card, .cta-box, .contact-grid"
    );

    const observer = new IntersectionObserver(
        (entries) => {

            entries.forEach((entry) => {

                if (entry.isIntersecting) {

                    entry.target.classList.add("show");

                    observer.unobserve(entry.target);

                }

            });

        },
        {
            threshold: 0.15
        }
    );


    elements.forEach((element) => {

        element.classList.add("reveal");

        observer.observe(element);

    });

});
```
