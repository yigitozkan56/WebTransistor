pub mod gpu_solver;

use gpu_solver::{gpu_get_hardware_info, gpu_init_circuit, gpu_step_batch};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            gpu_get_hardware_info,
            gpu_init_circuit,
            gpu_step_batch
        ])
        .run(tauri::generate_context!())
        .expect("error while running PureSilicon Tauri application");
}
