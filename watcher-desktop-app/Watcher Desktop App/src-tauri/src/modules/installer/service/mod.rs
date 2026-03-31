mod environment;
mod installation;
mod shell;
mod types;

pub use environment::check_environment;
pub use installation::start_installation;
pub use types::EnvironmentStatus;
