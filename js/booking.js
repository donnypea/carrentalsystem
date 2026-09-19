// ================================
// SUPABASE CONNECTION
// ================================

const SUPABASE_URL = "https://uvaoanwfkjzssynqaaeg.supabase.co";
const SUPABASE_KEY = "sb_publishable_GFAMtGSkcs4EKtrH8CCbtg_sX-7WGVW";

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);


// ================================
// BOOKING FORM
// ================================

const bookingForm = document.getElementById("bookingForm");
const formMessage = document.getElementById("formMessage");

bookingForm.addEventListener("submit", async function (event) {

    event.preventDefault();


    // ================================
    // GET FORM VALUES
    // ================================

    const customerName =
        document.getElementById("customerName").value.trim();

    const customerContact =
        document.getElementById("customerContact").value.trim();

    const service =
        document.getElementById("service").value;

    const appointmentDate =
        document.getElementById("appointmentDate").value;

    const appointmentTime =
        document.getElementById("appointmentTime").value;

    const guests =
        Number(document.getElementById("guests").value);

    const pickupLocation =
        document.getElementById("pickupLocation").value.trim();

    const notes =
        document.getElementById("notes").value.trim();


    // ================================
    // VALIDATION
    // ================================

    if (
        !customerName ||
        !customerContact ||
        !service ||
        !appointmentDate ||
        !appointmentTime ||
        !pickupLocation
    ) {

        showMessage(
            "Please complete all required fields.",
            "error"
        );

        return;
    }


    // ================================
    // DISABLE SUBMIT BUTTON
    // ================================

    const submitButton =
        bookingForm.querySelector("button[type='submit']");

    submitButton.disabled = true;
    submitButton.textContent = "Submitting...";


    // ================================
    // SAVE APPOINTMENT
    // ================================

    const { error } = await supabaseClient
        .from("appointments")
        .insert([
            {
                customer_name: customerName,
                customer_contact: customerContact,
                service: service,
                appointment_date: appointmentDate,
                appointment_time: appointmentTime,
                guests: guests,
                pickup_location: pickupLocation,
                notes: notes
            }
        ]);


    // ================================
    // HANDLE ERROR
    // ================================

    if (error) {

        console.error("Supabase error:", error);

        showMessage(
            "Something went wrong. Please try again.",
            "error"
        );

        submitButton.disabled = false;
        submitButton.textContent = "Request Appointment";

        return;
    }


    // ================================
    // SUCCESS
    // ================================

    console.log("Appointment created successfully!");

    showMessage(
        "Your appointment request has been submitted successfully!",
        "success"
    );

    bookingForm.reset();

    submitButton.disabled = false;
    submitButton.textContent = "Request Appointment";

});


// ================================
// MESSAGE FUNCTION
// ================================

function showMessage(message, type) {

    formMessage.textContent = message;

    formMessage.className =
        `form-message ${type}`;
}